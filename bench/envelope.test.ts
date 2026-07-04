import { describe, expect, it } from 'vitest'
import { decodePcm, encodeFile } from '../app/core/ohloud'
import { simulateChannel } from './channel'
import { randomBytes } from './modem'

// Survival-envelope regression gate. The e2e room presets are spot checks;
// these pins hold the measured CLIFFS so a future change can't silently trade
// tolerance for speed. Every pin sits ONE NOTCH inside its measured cliff —
// right at the edge, individual noise seeds flip — and uses a payload size
// measured solid at that level (small payloads sit closer to every cliff:
// fewer blocks concentrate errors). Levels from the envelope sweeps
// (bench, 2026-07):
//
//   robust:               noise cliff ≤ 0 dB SNR (§16 calibration) — pinned at 6 dB
//   fast  (classic+RQ25): noise cliff 8 dB @ reverb 0.25 (the v1 envelope,
//                         improved by TX PAPR limiting) — pinned at 10 dB
//   turbo (wide QPSK+RQ10): noise cliff 12 dB @ reverb 0.25 after PAPR
//                         limiting (was 18 dB in phase 1) — pinned at 14 dB
//                         (1 KB) with a 30 B pin at 16 dB, plus clip- and
//                         rolloff pins. 16-QAM Turbo was tried and rolled
//                         back 2026-07-03: it passed the bench but failed on
//                         real devices — see MODE_OFDM_QAM16_WIDE's note.
//   both OFDM rolloff:    speaker-rolloff cliff ≤ 6 kHz — pinned at 8 kHz
//
// If a change makes one of these fail, the envelope shrank: fix the change or
// consciously re-measure and re-pin with the user's sign-off.

const KDF = { memLog2: 12, time: 1, lanes: 1 }
const PW = 'correct horse battery staple'
const SR = 48000

function survives(mode: 'robust' | 'fast' | 'turbo', room: object, seed: number, bytes = 600): boolean {
  const content = randomBytes(bytes, seed)
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

  it('fast holds the improved v1 noise envelope: 10 dB SNR @ reverb 0.25', () => {
    expect(survives('fast', { snrDb: 10, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 73)).toBe(true)
    expect(survives('fast', { snrDb: 10, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 74)).toBe(true)
  }, 20_000)

  it('fast tolerates an 8 kHz speaker rolloff', () => {
    expect(survives('fast', { snrDb: 22, reverb: 0.2, bandLow: 300, bandHigh: 8000 }, 77)).toBe(true)
  }, 20_000)

  it('turbo holds its wide-QPSK envelope: 14 dB SNR @ reverb 0.25', () => {
    expect(survives('turbo', { snrDb: 14, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 75, 1000)).toBe(true)
    expect(survives('turbo', { snrDb: 14, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 76, 1000)).toBe(true)
  }, 20_000)

  it('turbo carries a tiny secret (30 B) with margin', () => {
    expect(survives('turbo', { snrDb: 16, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 81, 30)).toBe(true)
    expect(survives('turbo', { snrDb: 16, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }, 82, 30)).toBe(true)
  }, 20_000)

  it('turbo survives hard clipping (AGC)', () => {
    expect(survives('turbo', { snrDb: 30, reverb: 0.15, reverbDecaySec: 0.3, bandLow: 200, bandHigh: 15000, clip: 0.6 }, 78, 1000)).toBe(true)
  }, 20_000)

  it('turbo tolerates an 8 kHz speaker rolloff', () => {
    expect(survives('turbo', { snrDb: 22, reverb: 0.2, bandLow: 300, bandHigh: 8000 }, 79, 1000)).toBe(true)
  }, 20_000)
})
