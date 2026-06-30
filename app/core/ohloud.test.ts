import { describe, expect, it } from 'vitest'
import { CorruptedError, WrongPassphraseError } from './errors'
import { decodePcm, encodeFile, encodeText } from './ohloud'

const FAST = { memLog2: 12, time: 1, lanes: 1 } // 4 MiB — fast for tests
const PW = 'correct horse battery staple'

// Simulate the air: leading silence + additive noise.
function throughChannel(pcm: Float32Array, leadSilence: number, noiseAmp: number, seed: number): Float32Array {
  const out = new Float32Array(leadSilence + pcm.length + 2000)
  out.set(pcm, leadSilence)
  let x = seed >>> 0
  for (let i = 0; i < out.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7FFFFFFF
    out[i] = out[i]! + ((x >>> 10) / 0x1FFFFF - 0.5) * 2 * noiseAmp
  }
  return out
}

describe('end-to-end pipeline (encode → channel → decode)', () => {
  it('round-trips a secret text message', () => {
    const msg = 'meet me at 6 🧸 — vault code 4815162342'
    const { pcm, durationSec } = encodeText(msg, PW, { kdf: FAST })
    expect(durationSec).toBeGreaterThan(0)

    const heard = throughChannel(pcm, 4096, 0.02, 7)
    const out = decodePcm(heard, PW, { maxSearchSamples: 8192 })
    expect(out.isText).toBe(true)
    expect(out.text).toBe(msg)
  })

  it('round-trips a binary file', () => {
    const content = new Uint8Array(256).map((_, i) => (i * 37 + 5) & 0xFF)
    const { pcm } = encodeFile('keys.bin', content, PW, { kdf: FAST })
    const out = decodePcm(throughChannel(pcm, 2048, 0.02, 99), PW, { maxSearchSamples: 8192 })
    expect(out.isText).toBe(false)
    expect(out.filename).toBe('keys.bin')
    expect([...out.content]).toEqual([...content])
  })

  it('rejects a wrong passphrase distinctly', () => {
    const { pcm } = encodeText('secret', PW, { kdf: FAST })
    const heard = throughChannel(pcm, 1024, 0.02, 3)
    expect(() => decodePcm(heard, 'wrong-key', { maxSearchSamples: 4096 })).toThrow(WrongPassphraseError)
  })

  it('reports a destroyed payload as corruption', () => {
    const { pcm } = encodeText('secret', PW, { kdf: FAST })
    // Wipe the second half (mostly payload); header near the start survives.
    for (let i = Math.floor(pcm.length / 2); i < pcm.length; i++)
      pcm[i] = 0
    expect(() => decodePcm(pcm, PW, { maxSearchSamples: 4096 })).toThrow(CorruptedError)
  })
})
