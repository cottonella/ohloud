import { describe, expect, it } from 'vitest'
import { simulateChannel } from '../../bench/channel'
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

// Independent linear resampler for the simulated air — distinct from the codec's
// own windowed-sinc, so a passing cross-rate test means real interop rather than
// a kernel inverting itself.
function linResample(pcm: Float32Array, from: number, to: number): Float32Array {
  const ratio = to / from
  const outLen = Math.floor(pcm.length * ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio
    const j = Math.floor(src)
    const frac = src - j
    out[i] = (pcm[j] ?? 0) * (1 - frac) + (pcm[j + 1] ?? 0) * frac
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

  it('round-trips a secret in Fast OFDM mode', () => {
    const msg = 'fast secret over OFDM 🐇 — far quicker than Morse'
    const { pcm, durationSec } = encodeText(msg, PW, { kdf: FAST, mode: 'fast' })
    expect(durationSec).toBeGreaterThan(0)

    const heard = throughChannel(pcm, 4096, 0.01, 11)
    const out = decodePcm(heard, PW, { maxSearchSamples: 8192 })
    expect(out.isText).toBe(true)
    expect(out.text).toBe(msg)
  })

  it('sends Fast mode in a fraction of Robust mode’s airtime', () => {
    const content = new Uint8Array(800).map((_, i) => (i * 53 + 7) & 0xFF)
    const robust = encodeFile('blob.bin', content, PW, { kdf: FAST, mode: 'robust' })
    const fast = encodeFile('blob.bin', content, PW, { kdf: FAST, mode: 'fast' })
    expect(fast.durationSec).toBeLessThan(robust.durationSec / 3)

    const out = decodePcm(throughChannel(fast.pcm, 2048, 0.01, 21), PW, { maxSearchSamples: 8192 })
    expect([...out.content]).toEqual([...content])
  })

  it('survives a reverberant room in Fast mode (real-room regression)', () => {
    // The bug: any room reverb made Fast "always corrupted". Fixed by the QPSK
    // default + a guard gap that lets the preamble reverb decay. This is a
    // realistic "normal room": 20 dB SNR, 0.25 reverb / 0.4 s decay, band-limited.
    const msg = 'reverb-proof secret 🐇 — the quick brown fox 0123456789'
    const { pcm } = encodeText(msg, PW, { kdf: FAST, mode: 'fast' })
    const heard = simulateChannel(pcm, { snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000, sampleRate: 48000, seed: 42 })
    const out = decodePcm(heard, PW, { maxSearchSamples: 1 << 16 })
    expect(out.text).toBe(msg)
  })

  it('survives a band-limited speaker in Fast mode (CP-timing regression)', () => {
    // The real-hardware bug: a speaker's rolloff has group delay that shifts OFDM
    // symbol timing a few samples; the demod read at the very end of the cyclic
    // prefix (zero late margin) and fell into inter-symbol interference → always
    // corrupt over the air, though synthetic round-trips passed. Fixed by CP-based
    // timing sync. This band-limits hard just above the OFDM band to exercise it.
    const msg = 'band-limited speaker secret 🐇 0123456789'
    const { pcm } = encodeText(msg, PW, { kdf: FAST, mode: 'fast' })
    const heard = simulateChannel(pcm, { snrDb: 22, reverb: 0.2, reverbDecaySec: 0.35, bandLow: 300, bandHigh: 7000, sampleRate: 48000, seed: 5 })
    const out = decodePcm(heard, PW, { maxSearchSamples: 1 << 16 })
    expect(out.text).toBe(msg)
  })

  it('rejects a wrong passphrase distinctly', () => {
    const { pcm } = encodeText('secret', PW, { kdf: FAST })
    const heard = throughChannel(pcm, 1024, 0.02, 3)
    expect(() => decodePcm(heard, 'wrong-key', { maxSearchSamples: 4096 })).toThrow(WrongPassphraseError)
  })

  it('interoperates across sample rates (48 kHz sender → 44.1 kHz receiver)', () => {
    const msg = 'cross-device secret 🐻'
    const { pcm } = encodeText(msg, PW, { kdf: FAST, sampleRate: 48000 })

    // Simulate the air → a 44.1 kHz mic: linear resample 48000 → 44100.
    const ratio = 44100 / 48000
    const outLen = Math.floor(pcm.length * ratio)
    const resampled = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const src = i / ratio
      const j = Math.floor(src)
      const frac = src - j
      resampled[i] = (pcm[j] ?? 0) * (1 - frac) + (pcm[j + 1] ?? 0) * frac
    }

    const out = decodePcm(resampled, PW, { sampleRate: 44100 })
    expect(out.text).toBe(msg)
  })

  it('interoperates across rates in Fast mode (48 kHz sender → 44.1 kHz receiver)', () => {
    const msg = 'fast cross-device secret 🐇🐻 over OFDM'
    const { pcm } = encodeText(msg, PW, { kdf: FAST, mode: 'fast', sampleRate: 48000 })
    const heard = linResample(pcm, 48000, 44100) // the air → a 44.1 kHz mic
    const out = decodePcm(heard, PW, { sampleRate: 44100 })
    expect(out.text).toBe(msg)
  })

  it('round-trips Fast mode end-to-end at a non-48 kHz rate (44.1 kHz)', () => {
    const content = new Uint8Array(400).map((_, i) => (i * 29 + 3) & 0xFF)
    const { pcm } = encodeFile('k.bin', content, PW, { kdf: FAST, mode: 'fast', sampleRate: 44100 })
    const out = decodePcm(throughChannel(pcm, 2048, 0.004, 8), PW, { sampleRate: 44100, maxSearchSamples: 8192 })
    expect([...out.content]).toEqual([...content])
  })

  it('reports a destroyed payload as corruption', () => {
    const { pcm } = encodeText('secret', PW, { kdf: FAST })
    // Wipe the second half (mostly payload); header near the start survives.
    for (let i = Math.floor(pcm.length / 2); i < pcm.length; i++)
      pcm[i] = 0
    expect(() => decodePcm(pcm, PW, { maxSearchSamples: 4096 })).toThrow(CorruptedError)
  })
})
