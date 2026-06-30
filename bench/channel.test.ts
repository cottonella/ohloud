import type { ChannelOptions } from './channel'
import { describe, expect, it } from 'vitest'
import { simulateChannel } from './channel'
import { bytesEqual, modemDecodeFrame, modemEncodeFrame, randomBytes, SAMPLE_RATE } from './modem'

// Regression guard for the §16 calibration findings: the Robust MFSK modem must
// keep recovering frames through realistic room conditions, and fail gracefully
// (never crash or mis-decode silently) when the channel is hopeless.

function decodeCount(ch: ChannelOptions, trials = 4): number {
  let ok = 0
  for (let t = 0; t < trials; t++) {
    const seed = 500 + t * 13
    const blob = randomBytes(180, seed)
    const pcm = simulateChannel(modemEncodeFrame(blob), { ...ch, sampleRate: SAMPLE_RATE, seed })
    if (bytesEqual(modemDecodeFrame(pcm) ?? new Uint8Array(0), blob))
      ok++
  }
  return ok
}

describe('acoustic robustness (simulated channel)', () => {
  it('recovers cleanly with no impairment', () => {
    expect(decodeCount({})).toBe(4)
  })

  it('survives a normal room (20 dB SNR, reverb, band-limited)', () => {
    expect(decodeCount({ snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 })).toBe(4)
  })

  it('survives a noisy room (12 dB SNR, heavier reverb)', () => {
    expect(decodeCount({ snrDb: 12, reverb: 0.35, reverbDecaySec: 0.45, bandLow: 400, bandHigh: 10000 })).toBe(4)
  })

  it('tolerates a lowpass cutting into the MFSK band (3-4 kHz)', () => {
    expect(decodeCount({ snrDb: 15, reverb: 0.2, bandLow: 300, bandHigh: 4000 })).toBe(4)
  })

  it('fails gracefully under hopeless noise (null, never a wrong result)', () => {
    const blob = randomBytes(180, 9)
    const pcm = simulateChannel(modemEncodeFrame(blob), { snrDb: -18, sampleRate: SAMPLE_RATE, seed: 9 })
    const out = modemDecodeFrame(pcm)
    expect(out === null || !bytesEqual(out, blob)).toBe(true)
  })
})
