import type { KdfParams } from '../constants'
import { ByteReader, bytesEqualCT, ByteWriter } from '../bytes'
import {
  CONTAINER_MAGIC,
  CONTAINER_VERSION,
  HEADER_LEN,
  SUITE_ARGON2ID_XCHACHA,
} from '../constants'
import { FormatError, UnsupportedError } from '../errors'

export interface ContainerHeader {
  version: number
  suite: number
  kdf: KdfParams
  flags: number
  salt: Uint8Array
  commit: Uint8Array
  nonce: Uint8Array
  ctLen: number
}

/** Serialize the 86-byte cleartext header (FORMAT.md A.2). */
export function serializeHeader(h: ContainerHeader): Uint8Array {
  return new ByteWriter()
    .bytes(CONTAINER_MAGIC) // 0..4
    .u8(h.version) // 4
    .u8(h.suite) // 5
    .u8(h.kdf.memLog2) // 6
    .u8(h.kdf.time) // 7
    .u8(h.kdf.lanes) // 8
    .u8(h.flags) // 9
    .bytes(h.salt) // 10..26
    .bytes(h.commit) // 26..58
    .bytes(h.nonce) // 58..82
    .u32(h.ctLen) // 82..86
    .toBytes()
}

export function parseHeader(buf: Uint8Array): ContainerHeader {
  if (buf.length < HEADER_LEN)
    throw new FormatError('container shorter than header')

  const rd = new ByteReader(buf)

  if (!bytesEqualCT(rd.bytes(4), CONTAINER_MAGIC))
    throw new FormatError('bad magic (not an ohloud container)')

  const version = rd.u8()
  if (version !== CONTAINER_VERSION)
    throw new UnsupportedError(`container version ${version}`)

  const suite = rd.u8()
  if (suite !== SUITE_ARGON2ID_XCHACHA)
    throw new UnsupportedError(`crypto suite ${suite}`)

  const memLog2 = rd.u8()
  const time = rd.u8()
  const lanes = rd.u8()
  const flags = rd.u8()
  const salt = rd.bytes(16)
  const commit = rd.bytes(32)
  const nonce = rd.bytes(24)
  const ctLen = rd.u32()

  return { version, suite, kdf: { memLog2, time, lanes }, flags, salt, commit, nonce, ctLen }
}
