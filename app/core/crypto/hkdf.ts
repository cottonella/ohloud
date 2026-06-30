import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8Encode } from '../bytes'

const EMPTY = new Uint8Array(0)

/** HKDF-SHA256 with an empty salt and a string `info` label (domain separation). */
export function hkdfSha256(ikm: Uint8Array, info: string, length = 32): Uint8Array {
  return hkdf(sha256, ikm, EMPTY, utf8Encode(info), length)
}
