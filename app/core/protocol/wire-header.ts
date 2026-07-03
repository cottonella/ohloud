// Wire header (FORMAT.md B.3): a small, heavily protected descriptor the
// receiver reads first to learn how the payload was sent. Layout (31 bytes):
//   magic "OW"(2) ver(1) mode(1) fec(1) flags(1) blobLen(4) blockCount(2)
//   fecNsym(1) tailHash(16) crc16(2)
// then Reed–Solomon encoded with HEADER_NSYM parity for robustness.

import type { Constellation } from '../dsp/ofdm'
import { ByteReader, bytesEqualCT, ByteWriter } from '../bytes'
import { OFDM_BAND_HZ, OFDM_WIDE_BAND_HZ } from '../dsp/ofdm'
import { CorruptedError, UnsupportedError } from '../errors'
import { crc16 } from '../fec/crc'
import { ReedSolomonError, rsDecode, rsEncode } from '../fec/reed-solomon'

export const WIRE_VERSION = 0x01
export const MODE_MFSK = 0x00
export const MODE_OFDM_QPSK = 0x01
export const MODE_OFDM_QAM16 = 0x02
export const MODE_OFDM_QAM64 = 0x03
/**
 * QPSK over the wide 10 kHz lane — Fast's default since v0.4. Old receivers
 * see an unknown mode and reject cleanly; new receivers decode both lanes.
 */
export const MODE_OFDM_QPSK_WIDE = 0x04
export const FEC_RS = 0x00
export const FEC_RS_FOUNTAIN = 0x01 // inner RS per block + a RaptorQ fountain across blocks

/** True if `mode` selects the Fast OFDM payload modem. */
export function modeIsOfdm(mode: number): boolean {
  return (mode >= MODE_OFDM_QPSK && mode <= MODE_OFDM_QAM64) || mode === MODE_OFDM_QPSK_WIDE
}

/** True if the receiver knows how to demodulate this payload mode. */
export function modeIsKnown(mode: number): boolean {
  return mode === MODE_MFSK || modeIsOfdm(mode)
}

/** OFDM constellation carried by an OFDM mode byte (defaults to 16-QAM). */
export function modeConstellation(mode: number): Constellation {
  return mode === MODE_OFDM_QPSK || mode === MODE_OFDM_QPSK_WIDE
    ? 'qpsk'
    : mode === MODE_OFDM_QAM64 ? 'qam64' : 'qam16'
}

/** Subcarrier band ceiling (Hz) carried by an OFDM mode byte. */
export function modeBandHz(mode: number): number {
  return mode === MODE_OFDM_QPSK_WIDE ? OFDM_WIDE_BAND_HZ : OFDM_BAND_HZ
}

/** Mode byte for an OFDM constellation. */
export function ofdmMode(c: Constellation): number {
  return c === 'qpsk' ? MODE_OFDM_QPSK : c === 'qam64' ? MODE_OFDM_QAM64 : MODE_OFDM_QAM16
}

const MAGIC = new Uint8Array([0x4F, 0x57]) // "OW"
const HEADER_BODY_LEN = 29 // bytes covered by the CRC

// The wire header is fully attacker-controlled (anyone can play sound into the
// mic) and drives FEC allocations before any passphrase. Bound its size/param
// fields so a crafted descriptor can't force a huge buffer or a crashing
// per-block size. 16 MiB is hours of sound — far beyond any real transmission.
export const MAX_BLOB_LEN = 16 * 1024 * 1024
/** Max RS parity per 255-byte block: `per = 255 - nsym - 2` must stay ≥ 1. */
export const MAX_FEC_NSYM = 252
export const HEADER_DATA_LEN = 31 // body + crc16
export const HEADER_NSYM = 32 // RS parity for the header
export const HEADER_CODED_LEN = HEADER_DATA_LEN + HEADER_NSYM // 63

export interface WireHeader {
  protoVer: number
  mode: number
  fec: number
  flags: number
  blobLen: number
  blockCount: number
  fecNsym: number
  tailHash: Uint8Array // 16 bytes
}

function serialize(h: WireHeader): Uint8Array {
  const body = new ByteWriter()
    .bytes(MAGIC)
    .u8(h.protoVer)
    .u8(h.mode)
    .u8(h.fec)
    .u8(h.flags)
    .u32(h.blobLen)
    .u16(h.blockCount)
    .u8(h.fecNsym)
    .bytes(h.tailHash)
    .toBytes()
  return new ByteWriter().bytes(body).u16(crc16(body)).toBytes()
}

function parse(buf: Uint8Array): WireHeader {
  const body = buf.subarray(0, HEADER_BODY_LEN)
  const rd = new ByteReader(buf)

  if (!bytesEqualCT(rd.bytes(2), MAGIC))
    throw new CorruptedError('wire header magic mismatch')

  const protoVer = rd.u8()
  const mode = rd.u8()
  const fec = rd.u8()
  const flags = rd.u8()
  const blobLen = rd.u32()
  const blockCount = rd.u16()
  const fecNsym = rd.u8()
  const tailHash = rd.bytes(16).slice()
  const crc = rd.u16()

  if (crc !== crc16(body))
    throw new CorruptedError('wire header CRC mismatch')
  if (protoVer !== WIRE_VERSION)
    throw new UnsupportedError(`wire protocol version ${protoVer}`)
  // Range-check the allocation-driving fields (CRC only proves integrity, not
  // sanity): reject an absurd blob size, an empty/degenerate block count, or a
  // parity value that would make the per-block payload ≤ 0 (an OOB/RangeError).
  if (blockCount < 1)
    throw new CorruptedError('wire header block count out of range')
  if (blobLen > MAX_BLOB_LEN)
    throw new CorruptedError('wire header blob length out of range')
  if (fecNsym > MAX_FEC_NSYM)
    throw new CorruptedError('wire header FEC parity out of range')

  return { protoVer, mode, fec, flags, blobLen, blockCount, fecNsym, tailHash }
}

/** Serialize + Reed–Solomon encode the header to HEADER_CODED_LEN bytes. */
export function encodeWireHeader(h: WireHeader): Uint8Array {
  return rsEncode(serialize(h), HEADER_NSYM)
}

/** Reed–Solomon decode + parse the header. Throws CorruptedError if unreadable. */
export function decodeWireHeader(coded: Uint8Array): WireHeader {
  let data: Uint8Array
  try {
    data = rsDecode(coded, HEADER_NSYM)
  }
  catch (e) {
    if (e instanceof ReedSolomonError)
      throw new CorruptedError('wire header unrecoverable')
    throw e
  }
  return parse(data)
}
