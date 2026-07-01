// Property-style tests: many randomized payloads round-trip through the crypto +
// container + FEC layers. Complements the fixed-vector unit tests by exploring
// random sizes, bytes, passphrases, and Unicode.

import { describe, expect, it } from 'vitest'
import { open } from './container/open'
import { sealFile, sealText } from './container/text'
import { fecDecode, fecEncode } from './fec/blocks'

// Tiniest valid Argon2id (256 KiB) — the KDF dominates runtime, so keep it small
// for the many iterations here; correctness of the KDF itself is covered elsewhere.
const TINY = { memLog2: 8, time: 1, lanes: 1 }

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s
  }
}

function randBytes(n: number, r: () => number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    out[i] = (r() >>> 16) & 0xFF
  return out
}

describe('property — random payloads round-trip', () => {
  it('seals and opens random binary files (crypto + container)', () => {
    const r = rng(0x1234)
    for (let t = 0; t < 20; t++) {
      const content = randBytes(r() % 1600, r)
      const pw = `pw-${r()}-${r()}`
      const name = `f${r() % 1000}.bin`
      const out = open(sealFile(name, content, pw, { kdf: TINY }), pw)
      expect(out.isText).toBe(false)
      expect(out.filename).toBe(name)
      expect([...out.content]).toEqual([...content])
    }
  }, 20_000)

  it('seals and opens random Unicode text (crypto + container)', () => {
    const r = rng(0x9999)
    const words = ['hello', '🧸', 'secret', 'meet@6', 'vault', 'ключ', '世界', 'café', '🐢🐇']
    for (let t = 0; t < 15; t++) {
      const msg = Array.from({ length: r() % 24 }, () => words[r() % words.length]).join(' ')
      const pw = `k${r()}`
      const out = open(sealText(msg, pw, { kdf: TINY }), pw)
      expect(out.isText).toBe(true)
      expect(out.text).toBe(msg)
    }
  }, 20_000)

  it('round-trips random blobs through RS + RaptorQ fountain', () => {
    const r = rng(0x7)
    for (let t = 0; t < 30; t++) {
      const blob = randBytes(1 + (r() % 2000), r)
      const { data, meta } = fecEncode(blob, { repair: 0.25 })
      expect([...fecDecode(data, meta)]).toEqual([...blob])
    }
  })
})
