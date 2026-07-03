// Reed–Solomon over GF(256), systematic, with errors-and-erasures decoding.
// Algorithm follows the canonical "Reed–Solomon codes for coders" reference
// (Wikiversity): syndromes → Forney syndromes → Berlekamp–Massey → Chien search
// → Forney. Corrects up to `nsym` erasures, or ⌊nsym/2⌋ errors, or a mix where
// 2·errors + erasures ≤ nsym.

import type { Poly } from './gf256'
import {
  gfInverse,
  gfMul,
  gfPow,
  polyAdd,
  polyDiv,
  polyEval,
  polyMul,
  polyScale,
} from './gf256'

export class ReedSolomonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReedSolomonError'
  }
}

/** Max symbols a codeword may hold (data + parity). */
export const RS_BLOCK_MAX = 255

function generatorPoly(nsym: number): Poly {
  let g: Poly = [1]
  for (let i = 0; i < nsym; i++)
    g = polyMul(g, [1, gfPow(2, i)])
  return g
}

/** Systematic encode: returns `data` followed by `nsym` parity bytes. */
export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  if (data.length + nsym > RS_BLOCK_MAX)
    throw new ReedSolomonError(`message too long (${data.length} + ${nsym} > ${RS_BLOCK_MAX})`)

  const gen = generatorPoly(nsym)
  const out = new Uint8Array(data.length + nsym)
  out.set(data, 0)

  for (let i = 0; i < data.length; i++) {
    const coef = out[i]!
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++)
        out[i + j]! ^= gfMul(gen[j]!, coef)
    }
  }

  out.set(data, 0) // restore message; parity occupies the trailing nsym bytes
  return out
}

function calcSyndromes(msg: Poly, nsym: number): Poly {
  const synd = Array.from<number>({ length: nsym + 1 }).fill(0)
  for (let i = 0; i < nsym; i++)
    synd[i + 1] = polyEval(msg, gfPow(2, i))
  return synd
}

function findErrataLocator(positions: number[]): Poly {
  let loc: Poly = [1]
  for (const p of positions)
    loc = polyMul(loc, polyAdd([1], [gfPow(2, p), 0]))
  return loc
}

function findErrorEvaluator(synd: Poly, errLoc: Poly, nsym: number): Poly {
  const divisor = [1, ...Array.from<number>({ length: nsym + 1 }).fill(0)]
  return polyDiv(polyMul(synd, errLoc), divisor).remainder
}

function correctErrata(msg: Uint8Array, synd: Poly, errPos: number[]): Uint8Array {
  const coefPos = errPos.map(p => msg.length - 1 - p)
  const errLoc = findErrataLocator(coefPos)
  const errEval = findErrorEvaluator([...synd].reverse(), errLoc, errLoc.length - 1).reverse()

  // X = error locations as field elements
  const X: number[] = coefPos.map((cp) => {
    const l = 255 - cp
    return gfPow(2, -l)
  })

  const E = new Uint8Array(msg.length)
  for (let i = 0; i < X.length; i++) {
    const Xi = X[i]!
    const XiInv = gfInverse(Xi)

    let errLocPrime = 1
    for (let j = 0; j < X.length; j++) {
      if (j !== i)
        errLocPrime = gfMul(errLocPrime, 1 ^ gfMul(XiInv, X[j]!))
    }
    if (errLocPrime === 0)
      throw new ReedSolomonError('could not find error magnitude (singular)')

    let y = polyEval([...errEval].reverse(), XiInv)
    y = gfMul(Xi, y)

    E[errPos[i]!] = gfDivSafe(y, errLocPrime)
  }

  return xorBytes(msg, E)
}

function gfDivSafe(a: number, b: number): number {
  // local div that mirrors gf_div for the Forney step
  if (a === 0)
    return 0
  return gfMul(a, gfInverse(b))
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++)
    out[i] = a[i]! ^ (b[i] ?? 0)
  return out
}

function findErrorLocator(synd: Poly, nsym: number, eraseCount: number): Poly {
  let errLoc: Poly = [1]
  let oldLoc: Poly = [1]

  const syndShift = synd.length > nsym ? synd.length - nsym : 0

  for (let i = 0; i < nsym - eraseCount; i++) {
    const K = i + syndShift
    let delta = synd[K]!
    for (let j = 1; j < errLoc.length; j++)
      delta ^= gfMul(errLoc[errLoc.length - 1 - j]!, synd[K - j]!)

    oldLoc = [...oldLoc, 0]

    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta)
        oldLoc = polyScale(errLoc, gfInverse(delta))
        errLoc = newLoc
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta))
    }
  }

  while (errLoc.length && errLoc[0] === 0)
    errLoc.shift()

  const errs = errLoc.length - 1
  if ((errs - eraseCount) * 2 + eraseCount > nsym)
    throw new ReedSolomonError('too many errors to correct')

  return errLoc
}

function findErrors(errLocReversed: Poly, nmess: number): number[] {
  const errs = errLocReversed.length - 1
  const positions: number[] = []
  for (let i = 0; i < nmess; i++) {
    if (polyEval(errLocReversed, gfPow(2, i)) === 0)
      positions.push(nmess - 1 - i)
  }
  if (positions.length !== errs)
    throw new ReedSolomonError('Chien search failed (wrong number of roots)')
  return positions
}

function forneySyndromes(synd: Poly, erasePos: number[], nmess: number): Poly {
  const erasePosRev = erasePos.map(p => nmess - 1 - p)
  const fsynd = synd.slice(1)
  for (let i = 0; i < erasePosRev.length; i++) {
    const x = gfPow(2, erasePosRev[i]!)
    for (let j = 0; j < fsynd.length - 1; j++)
      fsynd[j] = gfMul(fsynd[j]!, x) ^ fsynd[j + 1]!
  }
  return fsynd
}

/**
 * Decode a codeword, correcting errors and (optionally) known erasures.
 * Returns the recovered `data` (codeword minus the `nsym` parity bytes).
 * Throws ReedSolomonError if the message cannot be recovered.
 */
export function rsDecode(codeword: Uint8Array, nsym: number, erasePos: number[] = []): Uint8Array {
  if (codeword.length > RS_BLOCK_MAX)
    throw new ReedSolomonError('codeword too long')
  if (erasePos.length > nsym)
    throw new ReedSolomonError('too many erasures to correct')

  // Annotated: .slice() infers Uint8Array<ArrayBuffer>, but correctErrata
  // returns the plain (ArrayBufferLike) flavor — the wider type fits both.
  let msg: Uint8Array = codeword.slice()
  for (const p of erasePos)
    msg[p] = 0

  const synd = calcSyndromes([...msg], nsym)
  if (Math.max(...synd) === 0)
    return msg.subarray(0, msg.length - nsym) // already clean

  const fsynd = forneySyndromes(synd, erasePos, msg.length)
  const errLoc = findErrorLocator(fsynd, nsym, erasePos.length)
  const errPos = findErrors([...errLoc].reverse(), msg.length)

  msg = correctErrata(msg, synd, [...erasePos, ...errPos])

  const check = calcSyndromes([...msg], nsym)
  if (Math.max(...check) > 0)
    throw new ReedSolomonError('failed to correct message')

  return msg.subarray(0, msg.length - nsym)
}
