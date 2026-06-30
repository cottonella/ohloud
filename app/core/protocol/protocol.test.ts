import { describe, expect, it } from 'vitest'
import { CorruptedError } from '../errors'
import { fecEncode } from '../fec/blocks'
import { assembleFrame, parseFrame } from './frame'
import { decodeWireHeader, encodeWireHeader, FEC_RS, MODE_MFSK, WIRE_VERSION } from './wire-header'

function sampleHeader() {
  return {
    protoVer: WIRE_VERSION,
    mode: MODE_MFSK,
    fec: FEC_RS,
    flags: 0,
    blobLen: 12345,
    blockCount: 7,
    fecNsym: 64,
    tailHash: new Uint8Array(16).map((_, i) => (i * 11) & 0xFF),
  }
}

describe('wire header', () => {
  it('round-trips all fields', () => {
    const h = sampleHeader()
    const out = decodeWireHeader(encodeWireHeader(h))
    expect(out.blobLen).toBe(12345)
    expect(out.blockCount).toBe(7)
    expect(out.fecNsym).toBe(64)
    expect([...out.tailHash]).toEqual([...h.tailHash])
  })

  it('survives RS-correctable byte errors', () => {
    const coded = encodeWireHeader(sampleHeader())
    for (let i = 0; i < 10; i++) // ≤16 correctable
      coded[i * 5] = coded[i * 5]! ^ 0xFF
    expect(decodeWireHeader(coded).blockCount).toBe(7)
  })

  it('throws when corrupted beyond RS', () => {
    const coded = encodeWireHeader(sampleHeader())
    for (let i = 0; i < 25; i++)
      coded[i] = 0
    expect(() => decodeWireHeader(coded)).toThrow(CorruptedError)
  })
})

describe('frame assemble/parse', () => {
  it('locates the chirp and recovers header + payload through silence and noise', () => {
    const blob = new Uint8Array(400).map((_, i) => (i * 7) & 0xFF)
    const { data: fecData, meta } = fecEncode(blob, { nsym: 64 })
    const headerCoded = encodeWireHeader({
      protoVer: WIRE_VERSION,
      mode: MODE_MFSK,
      fec: FEC_RS,
      flags: 0,
      blobLen: blob.length,
      blockCount: meta.blockCount,
      fecNsym: 64,
      tailHash: new Uint8Array(16),
    })
    const frame = assembleFrame(headerCoded, fecData)

    // Channel: 4096 samples of leading silence + light noise everywhere.
    const pcm = new Float32Array(4096 + frame.length + 1000)
    pcm.set(frame, 4096)
    let x = 17
    for (let i = 0; i < pcm.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7FFFFFFF
      pcm[i] = pcm[i]! + ((x >>> 10) / 0x1FFFFF - 0.5) * 0.03
    }

    const parsed = parseFrame(pcm, 48000, 8192)
    expect(parsed.chirpOffset).toBeGreaterThan(4000)
    expect(parsed.chirpOffset).toBeLessThan(4200)
    expect(parsed.header.blockCount).toBe(meta.blockCount)
    expect([...parsed.fecData]).toEqual([...fecData])
  })
})
