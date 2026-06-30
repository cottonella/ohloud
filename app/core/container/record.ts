import { sha256 } from '@noble/hashes/sha2.js'
import { ByteReader, bytesEqualCT, ByteWriter, utf8Decode, utf8Encode } from '../bytes'
import { MAX_NAME_LEN, RECORD_VERSION } from '../constants'
import { CorruptedError, FormatError, UnsupportedError } from '../errors'

export interface InnerRecord {
  filename: string
  content: Uint8Array
}

/**
 * Serialize the inner record (the plaintext that gets compressed + encrypted):
 *   rec_ver(1) name_len(2) name(n) content_len(8) content_sha256(32) content(m)
 * The SHA-256 lives inside the encryption, so it is not a confirmation oracle.
 */
export function serializeRecord(record: InnerRecord): Uint8Array {
  const name = utf8Encode(record.filename)
  if (name.length > MAX_NAME_LEN)
    throw new FormatError(`filename too long (${name.length} > ${MAX_NAME_LEN})`)

  return new ByteWriter()
    .u8(RECORD_VERSION)
    .u16(name.length)
    .bytes(name)
    .u64(record.content.length)
    .bytes(sha256(record.content))
    .bytes(record.content)
    .toBytes()
}

export function parseRecord(buf: Uint8Array): InnerRecord {
  const rd = new ByteReader(buf)

  const ver = rd.u8()
  if (ver !== RECORD_VERSION)
    throw new UnsupportedError(`inner record version ${ver}`)

  const nameLen = rd.u16()
  if (nameLen > MAX_NAME_LEN)
    throw new FormatError('filename length exceeds maximum')
  const filename = utf8Decode(rd.bytes(nameLen))

  const contentLen = rd.u64()
  const hash = rd.bytes(32)
  const content = rd.bytes(contentLen)

  if (!bytesEqualCT(sha256(content), hash))
    throw new CorruptedError('content hash mismatch')

  return { filename, content }
}
