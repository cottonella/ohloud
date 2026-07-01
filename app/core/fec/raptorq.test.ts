import { describe, expect, it } from 'vitest'
import { raptorDecode, raptorEncoder } from './raptorq'

function rnd(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = (s >>> 16) & 0xFF
  }
  return out
}

function source(k: number, t: number, seed: number): Uint8Array[] {
  return Array.from({ length: k }, (_, i) => rnd(t, seed + i * 97))
}

function same(a: Uint8Array[] | null, b: Uint8Array[]): boolean {
  if (!a || a.length !== b.length)
    return false
  return a.every((s, i) => s.length === b[i]!.length && s.every((v, j) => v === b[i]![j]))
}

describe('raptorQ-family fountain', () => {
  it('round-trips from the first K encoding symbols', () => {
    for (const k of [1, 2, 5, 16, 50]) {
      const t = 48
      const src = source(k, t, 100 + k)
      const enc = raptorEncoder(src, t)
      const recv = Array.from({ length: k }, (_, esi) => ({ esi, data: enc.symbol(esi) }))
      expect(same(raptorDecode(recv, k, t), src)).toBe(true)
    }
  })

  it('recovers from a lossy subset (early symbols dropped)', () => {
    const k = 40
    const t = 64
    const src = source(k, t, 7)
    const enc = raptorEncoder(src, t)
    // Drop the first 12 encoding symbols; keep K+2 of the rest.
    const recv = Array.from({ length: k + 2 }, (_, i) => {
      const esi = i + 12
      return { esi, data: enc.symbol(esi) }
    })
    expect(same(raptorDecode(recv, k, t), src)).toBe(true)
  })

  it('recovers from a scattered subset of a large symbol pool', () => {
    const k = 24
    const t = 32
    const src = source(k, t, 55)
    const enc = raptorEncoder(src, t)
    // Keep every other ESI out of a pool of 2K+8 — plenty, but non-contiguous.
    const recv: { esi: number, data: Uint8Array }[] = []
    for (let esi = 1; recv.length < k + 2 && esi < 2 * k + 8; esi += 2)
      recv.push({ esi, data: enc.symbol(esi) })
    expect(same(raptorDecode(recv, k, t), src)).toBe(true)
  })

  it('returns null with fewer than K symbols', () => {
    const k = 20
    const t = 32
    const enc = raptorEncoder(source(k, t, 3), t)
    const recv = Array.from({ length: k - 1 }, (_, esi) => ({ esi, data: enc.symbol(esi) }))
    expect(raptorDecode(recv, k, t)).toBeNull()
  })
})
