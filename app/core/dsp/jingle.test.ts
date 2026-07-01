import { describe, expect, it } from 'vitest'
import { decodePcm, encodeText } from '../ohloud'
import { jingleSamples, synthXylophoneJingle } from './jingle'

const FAST = { memLog2: 12, time: 1, lanes: 1 } // 4 MiB — fast for tests

describe('xylophone jingle', () => {
  it('renders finite, in-range pcm of the expected length', () => {
    const j = synthXylophoneJingle(48000)
    expect(j.length).toBe(jingleSamples(48000))
    let peak = 0
    for (const v of j) {
      expect(Number.isFinite(v)).toBe(true)
      peak = Math.max(peak, Math.abs(v))
    }
    expect(peak).toBeGreaterThan(0.05) // it actually makes sound
    expect(peak).toBeLessThanOrEqual(1) // never clips past full scale
  })

  it('leaves a message decodable when played in front of the frame', () => {
    const PW = 'pier at nine'
    const msg = 'meet me under the willow 🌿'
    const enc = encodeText(msg, PW, { kdf: FAST })
    const j = synthXylophoneJingle(enc.sampleRate)

    // What the speaker actually emits: jingle, then the real frame.
    const aired = new Float32Array(j.length + enc.pcm.length)
    aired.set(j, 0)
    aired.set(enc.pcm, j.length)

    // The receiver scans past the jingle to the sync chirp and recovers the text.
    const out = decodePcm(aired, PW, { maxSearchSamples: j.length + (1 << 16) })
    expect(out.text).toBe(msg)
  })
})
