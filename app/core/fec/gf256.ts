// GF(2^8) arithmetic for Reed–Solomon, primitive polynomial 0x11D, generator
// α = 2 (the field used by QR codes and ggwave). Polynomials are number[] with
// index 0 = highest-degree coefficient.

const PRIM = 0x11D
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

// Build log/exp tables. EXP is doubled (512) so EXP[a+b] never needs a modulo.
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100)
      x ^= PRIM
  }
  for (let i = 255; i < 512; i++)
    EXP[i] = EXP[i - 255]!
}

export type Poly = number[]

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0)
    return 0
  return EXP[LOG[a]! + LOG[b]!]!
}

export function gfDiv(a: number, b: number): number {
  if (b === 0)
    throw new Error('GF(256) division by zero')
  if (a === 0)
    return 0
  return EXP[(LOG[a]! + 255 - LOG[b]!) % 255]!
}

export function gfPow(a: number, power: number): number {
  if (a === 0)
    return 0
  return EXP[((((LOG[a]! * power) % 255) + 255) % 255)]!
}

export function gfInverse(a: number): number {
  return EXP[(255 - LOG[a]!) % 255]!
}

export function polyScale(p: Poly, x: number): Poly {
  return p.map(c => gfMul(c, x))
}

export function polyAdd(p: Poly, q: Poly): Poly {
  const r = Array.from<number>({ length: Math.max(p.length, q.length) }).fill(0)
  for (let i = 0; i < p.length; i++)
    r[i + r.length - p.length] = p[i]!
  for (let i = 0; i < q.length; i++)
    r[i + r.length - q.length]! ^= q[i]!
  return r
}

export function polyMul(p: Poly, q: Poly): Poly {
  const r = Array.from<number>({ length: p.length + q.length - 1 }).fill(0)
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++)
      r[i + j]! ^= gfMul(p[i]!, q[j]!)
  }
  return r
}

/** Horner evaluation of polynomial `p` at `x`. */
export function polyEval(p: Poly, x: number): number {
  let y = p[0]!
  for (let i = 1; i < p.length; i++)
    y = gfMul(y, x) ^ p[i]!
  return y
}

/** Polynomial division; returns quotient and remainder. */
export function polyDiv(dividend: Poly, divisor: Poly): { quotient: Poly, remainder: Poly } {
  const out = dividend.slice()
  for (let i = 0; i < dividend.length - (divisor.length - 1); i++) {
    const coef = out[i]!
    if (coef !== 0) {
      for (let j = 1; j < divisor.length; j++) {
        if (divisor[j] !== 0)
          out[i + j]! ^= gfMul(divisor[j]!, coef)
      }
    }
  }
  const sep = out.length - (divisor.length - 1)
  return { quotient: out.slice(0, sep), remainder: out.slice(sep) }
}
