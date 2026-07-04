import { describe, expect, it } from 'vitest'
import { decodePcm, encodeFile } from '../app/core/ohloud'
import { simulateChannel } from './channel'
import { randomBytes } from './modem'

// Survival-envelope regression gate. The e2e room presets are spot checks;
// these pins hold the measured CLIFFS so a future change can't silently trade
// tolerance for speed. Every pin sits ONE NOTCH inside its measured cliff —
// right at the edge, individual noise seeds flip. Levels from the envelope
// sweep (bench, 2026-07):
//
//   robust:               noise cliff ≤ 0 dB SNR (§16 calibration) — pinned at 6 dB
//   fast  (classic+RQ25): noise cliff 10 dB @ reverb 0.25 (the v1 envelope) — pinned at 12 dB
//   turbo (wide  +RQ10):  noise cliff ~18 dB — pinned at 20 dB
//   both OFDM lanes:      speaker-rolloff cliff ≤ 6 kHz — pinned at 8 kHz
//
// If a change makes one of these fail, the envelope shrank: fix the change or
// consciously re-measure and re-pin with the user's sign-off.

const KDF = { memLog2: 12, time: 1, lanes: 1 }
const PW = 'correct horse battery staple'
const SR = 48000

function survives(mode: 'robust' | 'fast' | 'turbo', room: object, seed: number): boolean {
  const content = randomBytes(600, seed)
  const { pcm } = encodeFile('secret.bin', content, PW, { kdf: KDF, mode, sampleRate: SR })
  try {
    const out = decodePcm(simulateChannel(pcm, { ...room, sampleRate: SR, seed }), PW, { sampleRate: SR })
    return out.content.length === content.length && out.content.every((b, i) => b === content[i])
  }
  catch { return false }
}

describe('survival envelope pins', () => {
  it('robust holds 6 dB SNR @ reverb 0.25', () => {
    expect(survives('robust', { snrDb: 6, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 71)).toBe(true)
    expect(survives('robust', { snrDb: 6, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 72)).toBe(true)
  }, 40_000)

  it('fast holds the v1 noise envelope: 12 dB SNR @ reverb 0.25', () => {
    expect(survives('fast', { snrDb: 12, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 73)).toBe(true)
    expect(survives('fast', { snrDb: 12, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 74)).toBe(true)
  }, 20_000)

  it('turbo holds its own envelope: 20 dB SNR @ reverb 0.25', () => {
    expect(survives('turbo', { snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 75)).toBe(true)
    expect(survives('turbo', { snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 76)).toBe(true)
  }, 20_000)

  it('both OFDM lanes tolerate an 8 kHz speaker rolloff', () => {
    expect(survives('fast', { snrDb: 22, reverb: 0.2, bandLow: 300, bandHigh: 8000 }, 77)).toBe(true)
    expect(survives('turbo', { snrDb: 22, reverb: 0.2, bandLow: 300, bandHigh: 8000 }, 78)).toBe(true)
  }, 20_000)
})
