// RaptorQ-family fountain code over GF(256) (RFC 6330-inspired structure: an LDPC
// precode of intermediate symbols plus a sparse LT code on top, decoded by
// Gaussian elimination). It is RATELESS: from K source symbols it emits an endless
// stream of encoding symbols, and any K (+ a tiny overhead) of them reconstruct
// the source — so a file survives lost or unrecoverable blocks.
//
// NOT bit-exact to RFC 6330: ohloud never interoperates with an external RaptorQ
// codec, so spec-exact systematic-index tables buy nothing. Correctness is proven
// empirically (round-trip + random-erasure recovery over many trials) — see
// `raptorq.test.ts` and `bench/`.

import { gfInverse, gfMul } from './gf256'

// ── deterministic per-symbol PRNG (a row is regenerated from its ESI alone) ──
function mix32(a: number): number {
  let x = (a >>> 0) || 0x9E3779B9
  x = Math.imul(x ^ (x >>> 16), 0x45D9F3B)
  x = Math.imul(x ^ (x >>> 16), 0x45D9F3B)
  return (x ^ (x >>> 16)) >>> 0
}

function makeRng(seed: number): () => number {
  let s = mix32(seed) || 1
  return () => {
    s ^= (s << 13)
    s >>>= 0
    s ^= (s >>> 17)
    s ^= (s << 5)
    return (s >>>= 0)
  }
}

// ── precode geometry ────────────────────────────────────────────────────────
/** Number of LDPC redundancy symbols for K source symbols. */
function ldpcCount(k: number): number {
  return k <= 1 ? 0 : Math.max(2, Math.round(Math.sqrt(k)) + 1)
}

/** Total intermediate symbols L = K source + S LDPC. */
export function intermediateCount(k: number): number {
  return k + ldpcCount(k)
}

/**
 * Source-symbol members of each LDPC constraint (deterministic from K). Each
 *  source joins two constraints, so no source symbol is left unconstrained.
 */
function ldpcMembers(k: number): number[][] {
  const s = ldpcCount(k)
  const members: number[][] = Array.from({ length: s }, () => [])
  if (s === 0)
    return members
  for (let i = 0; i < k; i++) {
    const r = makeRng(0x0DDBA117 ^ i)
    const a = r() % s
    let b = r() % s
    if (b === a)
      b = (b + 1) % s
    members[a]!.push(i)
    members[b]!.push(i)
  }
  return members
}

// ── LT rows ─────────────────────────────────────────────────────────────────
/**
 * Degree of an LT symbol: roughly uniform over [1, L], so rows are dense enough
 *  that any L of them are full-rank with negligible overhead under GF(256).
 */
function ltDegree(rng: () => number, l: number): number {
  return 1 + (rng() % l)
}

/** The dense GF(256) coefficient row (length L) for encoding symbol `esi`. */
function ltRow(esi: number, l: number): Uint8Array {
  const row = new Uint8Array(l)
  const rng = makeRng(0x5BD1E995 ^ (esi + 1))
  const d = ltDegree(rng, l)
  let placed = 0
  while (placed < d) {
    const idx = rng() % l
    if (row[idx] === 0) {
      row[idx] = (rng() & 0xFF) || 1
      placed++
    }
  }
  return row
}

// ── encode ──────────────────────────────────────────────────────────────────
export interface RaptorEncoder {
  readonly k: number
  readonly t: number
  /** The encoding symbol (T bytes) for Encoding Symbol ID `esi` (0, 1, 2, …). */
  symbol: (esi: number) => Uint8Array
}

/**
 * Build an encoder over `source` (K symbols of T bytes). Precomputes the L
 *  intermediate symbols (source ‖ LDPC parity) once.
 */
export function raptorEncoder(source: Uint8Array[], t: number): RaptorEncoder {
  const k = source.length
  const l = intermediateCount(k)
  const c: Uint8Array[] = Array.from({ length: l }, () => new Uint8Array(t))
  for (let i = 0; i < k; i++)
    c[i]!.set(source[i]!)
  const members = ldpcMembers(k)
  for (let j = 0; j < members.length; j++) {
    const parity = c[k + j]!
    for (const i of members[j]!) {
      const src = source[i]!
      for (let b = 0; b < t; b++)
        parity[b]! ^= src[b]!
    }
  }

  return {
    k,
    t,
    symbol(esi: number): Uint8Array {
      const row = ltRow(esi, l)
      const out = new Uint8Array(t)
      for (let idx = 0; idx < l; idx++) {
        const coeff = row[idx]!
        if (coeff === 0)
          continue
        const ci = c[idx]!
        for (let b = 0; b < t; b++)
          out[b]! ^= gfMul(coeff, ci[b]!)
      }
      return out
    },
  }
}

// ── decode ──────────────────────────────────────────────────────────────────
export interface ReceivedSymbol {
  esi: number
  data: Uint8Array
}

/**
 * Recover the K source symbols from any received subset (each tagged with its
 * ESI). Returns the K symbols, or `null` if the received set is rank-deficient
 * (i.e. too few / unlucky — gather one or two more and retry).
 */
export function raptorDecode(received: ReceivedSymbol[], k: number, t: number): Uint8Array[] | null {
  const l = intermediateCount(k)
  const rows: Uint8Array[] = []
  const rhs: Uint8Array[] = []

  // LDPC constraint rows (homogeneous: parity ⊕ its members = 0).
  const members = ldpcMembers(k)
  for (let j = 0; j < members.length; j++) {
    const row = new Uint8Array(l)
    row[k + j] = 1
    for (const i of members[j]!)
      row[i] = 1
    rows.push(row)
    rhs.push(new Uint8Array(t))
  }

  // One LT equation per received symbol.
  for (const { esi, data } of received) {
    rows.push(ltRow(esi, l))
    rhs.push(data)
  }

  const c = solveGf256(rows, rhs, l, t)
  if (!c)
    return null
  return c.slice(0, k)
}

/**
 * Reduced-row-echelon solve of `rows · x = rhs` over GF(256); x is L symbols of
 *  T bytes. Returns null if rank < L.
 */
function solveGf256(rows: Uint8Array[], rhs: Uint8Array[], l: number, t: number): Uint8Array[] | null {
  const m = rows.length
  if (m < l)
    return null
  const a = rows.map(r => Uint8Array.from(r))
  const b = rhs.map(s => Uint8Array.from(s))
  const pivotCol = new Int32Array(l).fill(-1)
  let row = 0

  for (let col = 0; col < l && row < m; col++) {
    let piv = -1
    for (let r = row; r < m; r++) {
      if (a[r]![col] !== 0) {
        piv = r
        break
      }
    }
    if (piv === -1)
      continue

    const tmpA = a[row]!
    a[row] = a[piv]!
    a[piv] = tmpA
    const tmpB = b[row]!
    b[row] = b[piv]!
    b[piv] = tmpB

    const inv = gfInverse(a[row]![col]!)
    const ar = a[row]!
    const br = b[row]!
    for (let cc = col; cc < l; cc++)
      ar[cc] = gfMul(ar[cc]!, inv)
    for (let bb = 0; bb < t; bb++)
      br[bb] = gfMul(br[bb]!, inv)

    for (let r = 0; r < m; r++) {
      if (r === row)
        continue
      const f = a[r]![col]!
      if (f === 0)
        continue
      const arr = a[r]!
      const brr = b[r]!
      for (let cc = col; cc < l; cc++)
        arr[cc]! ^= gfMul(f, ar[cc]!)
      for (let bb = 0; bb < t; bb++)
        brr[bb]! ^= gfMul(f, br[bb]!)
    }

    pivotCol[row] = col
    row++
  }

  if (row < l)
    return null

  const x: Uint8Array[] = Array.from({ length: l }, () => new Uint8Array(t))
  for (let i = 0; i < l; i++)
    x[pivotCol[i]!] = b[i]!
  return x
}
