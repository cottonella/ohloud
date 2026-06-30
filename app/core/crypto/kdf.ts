import type { KdfParams } from '../constants'
import { argon2id } from '@noble/hashes/argon2.js'
import { utf8Encode } from '../bytes'

/**
 * Derive the 32-byte master key from a passphrase with Argon2id.
 * The passphrase is NFC-normalized so visually identical strings agree across
 * platforms/keyboards. `params.memLog2` ⇒ memory = 2^memLog2 KiB.
 */
export function deriveMasterKey(passphrase: string, salt: Uint8Array, params: KdfParams): Uint8Array {
  return argon2id(utf8Encode(passphrase.normalize('NFC')), salt, {
    t: params.time,
    m: 2 ** params.memLog2,
    p: params.lanes,
    dkLen: 32,
  })
}
