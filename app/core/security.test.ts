// Regression tests for the hardening against a HOSTILE, attacker-crafted
// transmission (anyone can play sound into the mic). Each asserts a crafted
// header is rejected cleanly instead of triggering an OOM / RangeError / crash.

import { describe, expect, it } from 'vitest'
import { parseHeader } from './container/header'
import { open } from './container/open'
import { sealText } from './container/text'
import { CorruptedError, UnsupportedError } from './errors'
import { fecDecode, FecDecodeError } from './fec/blocks'
import { decodeWireHeader, encodeWireHeader, FEC_RS, MODE_MFSK, WIRE_VERSION } from './protocol/wire-header'

const PW = 'correct horse battery staple'
const FAST = { memLog2: 12, time: 1, lanes: 1 }

describe('argon2id param bounds (pre-auth memory-bomb defense)', () => {
  it('rejects an out-of-range memLog2 before deriving the key (no OOM)', () => {
    const c = sealText('hi', PW, { kdf: FAST })
    c[6] = 255 // memLog2 byte → would request 2^255 KiB
    expect(() => parseHeader(c.subarray(0, 86))).toThrow(UnsupportedError)
    // open() must bail in parseHeader, never reaching Argon2's allocation.
    expect(() => open(c, PW)).toThrow(UnsupportedError)
  })

  it('rejects degenerate params (time=0 / lanes=0)', () => {
    const t0 = sealText('hi', PW, { kdf: FAST })
    t0[7] = 0 // time
    expect(() => parseHeader(t0.subarray(0, 86))).toThrow(UnsupportedError)

    const p0 = sealText('hi', PW, { kdf: FAST })
    p0[8] = 0 // lanes
    expect(() => parseHeader(p0.subarray(0, 86))).toThrow(UnsupportedError)
  })

  it('still accepts the production default and fast test params', () => {
    expect(() => parseHeader(sealText('ok', PW, { kdf: FAST }).subarray(0, 86))).not.toThrow()
    expect(() => parseHeader(sealText('ok', PW).subarray(0, 86))).not.toThrow() // DEFAULT_KDF
  })
})

describe('wire header bounds (hostile descriptor defense)', () => {
  const base = { protoVer: WIRE_VERSION, mode: MODE_MFSK, fec: FEC_RS, flags: 0, blobLen: 100, blockCount: 1, fecNsym: 64, tailHash: new Uint8Array(16) }

  it('rejects fecNsym that leaves no per-block payload (per <= 0)', () => {
    expect(() => decodeWireHeader(encodeWireHeader({ ...base, fecNsym: 254 }))).toThrow(CorruptedError)
  })

  it('rejects a zero block count (degenerate deinterleave)', () => {
    expect(() => decodeWireHeader(encodeWireHeader({ ...base, blockCount: 0 }))).toThrow(CorruptedError)
  })

  it('rejects an absurd declared blob length', () => {
    expect(() => decodeWireHeader(encodeWireHeader({ ...base, blobLen: 100 * 1024 * 1024 }))).toThrow(CorruptedError)
  })

  it('accepts a normal descriptor', () => {
    expect(() => decodeWireHeader(encodeWireHeader(base))).not.toThrow()
  })
})

describe('fec decode guard', () => {
  it('throws a recoverable FecDecodeError (not an uncaught RangeError) on per <= 0', () => {
    expect(() => fecDecode(new Uint8Array(255), { origLen: 10, blockCount: 1, nsym: 254, fountain: false }))
      .toThrow(FecDecodeError)
  })
})
