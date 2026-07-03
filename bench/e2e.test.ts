import { describe, expect, it } from 'vitest'
import { fecDecode, fecEncode } from '../app/core/fec/blocks'
import { decodePcm, encodeFile, estimateDurationSec } from '../app/core/ohloud'
import { assembleFrame, parseFrame } from '../app/core/protocol/frame'
import { encodeWireHeader, FEC_RS, MODE_OFDM_QPSK, MODE_OFDM_QPSK_WIDE, WIRE_VERSION } from '../app/core/protocol/wire-header'
import { simulateChannel } from './channel'
import { randomBytes } from './modem'

// End-to-end release gate: the full pipeline (seal → FEC → modulate → chirp
// frame) must survive each mode's advertised room preset, the wire must stay
// receive-compatible with the classic Fast lane, and the UI estimate must
// track the encoder exactly. Every phase of the speed roadmap re-proves
// itself here before it ships.

const KDF = { memLog2: 12, time: 1, lanes: 1 } // small — we test sound, not Argon2
const PW = 'correct horse battery staple'
const SR = 48000

// Room presets from the §16 calibration (see bench/run.ts).
const QUIET = { snrDb: 30, reverb: 0.15, reverbDecaySec: 0.3, bandLow: 200, bandHigh: 15000 }
const NORMAL = { snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 }
const NOISY = { snrDb: 12, reverb: 0.35, reverbDecaySec: 0.45, bandLow: 400, bandHigh: 10000 }

function roundTrip(mode: 'robust' | 'fast', bytes: number, room: object, seed: number): boolean {
  const content = randomBytes(bytes, seed)
  const { pcm } = encodeFile('secret.bin', content, PW, { kdf: KDF, mode, sampleRate: SR })
  const dirty = simulateChannel(pcm, { ...room, sampleRate: SR, seed })
  const out = decodePcm(dirty, PW, { sampleRate: SR })
  return out.content.length === content.length && out.content.every((b, i) => b === content[i])
}

describe('end-to-end through the calibrated rooms', () => {
  it('fast (wide lane) survives the quiet room', () => {
    expect(roundTrip('fast', 1000, QUIET, 11)).toBe(true)
    expect(roundTrip('fast', 1000, QUIET, 22)).toBe(true)
  }, 20_000)

  it('fast (wide lane) survives the normal room', () => {
    expect(roundTrip('fast', 1000, NORMAL, 33)).toBe(true)
    expect(roundTrip('fast', 1000, NORMAL, 44)).toBe(true)
  }, 20_000)

  it('robust survives the noisy room', () => {
    expect(roundTrip('robust', 600, NOISY, 55)).toBe(true)
    expect(roundTrip('robust', 600, NOISY, 66)).toBe(true)
  }, 40_000)
})

describe('wire compatibility', () => {
  it('fast sends on the wide lane with the per-mode FEC policy', () => {
    const { pcm } = encodeFile('a.bin', randomBytes(400, 7), PW, { kdf: KDF, mode: 'fast', sampleRate: SR })
    const { header } = parseFrame(pcm, SR)
    expect(header.mode).toBe(MODE_OFDM_QPSK_WIDE)
    expect(header.fecNsym).toBe(64)
  }, 20_000)

  it('still decodes the classic 6.5 kHz Fast lane (old senders keep working)', () => {
    // Hand-build a v1-style frame on the classic lane and demodulate it.
    const blob = randomBytes(400, 8)
    const { data, meta } = fecEncode(blob, { nsym: 64, repair: 0 })
    const header = encodeWireHeader({
      protoVer: WIRE_VERSION,
      mode: MODE_OFDM_QPSK,
      fec: FEC_RS,
      flags: 0,
      blobLen: blob.length,
      blockCount: meta.blockCount,
      fecNsym: 64,
      tailHash: new Uint8Array(16),
    })
    const pcm = assembleFrame(header, data, SR, MODE_OFDM_QPSK)
    const parsed = parseFrame(pcm, SR)
    expect(parsed.header.mode).toBe(MODE_OFDM_QPSK)
    const recovered = fecDecode(parsed.fecData, meta)
    expect(recovered.length).toBe(blob.length)
    expect(recovered.every((b, i) => b === blob[i])).toBe(true)
  }, 20_000)
})

describe('estimate ↔ encoder lockstep', () => {
  it('the UI estimate matches the actual frame duration exactly', () => {
    for (const mode of ['robust', 'fast'] as const) {
      const content = randomBytes(1000, 9) // incompressible → estimate is exact
      const est = estimateDurationSec(content.length, 'blob.bin'.length, SR, mode)
      const { durationSec } = encodeFile('blob.bin', content, PW, { kdf: KDF, mode, sampleRate: SR })
      expect(Math.abs(est - durationSec)).toBeLessThan(1e-9)
    }
  }, 20_000)
})
