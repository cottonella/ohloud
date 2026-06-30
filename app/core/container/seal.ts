import type { KdfParams } from '../constants'
import type { InnerRecord } from './record'
import { randomBytes } from '@noble/ciphers/utils.js'
import { concat } from '../bytes'
import {
  CONTAINER_VERSION,
  DEFAULT_KDF,
  FLAG_COMPRESSED,
  FLAG_IS_TEXT,
  HEADER_AAD_LEN,
  NONCE_LEN,
  SALT_LEN,
  SUITE_ARGON2ID_XCHACHA,
  TAG_LEN,
} from '../constants'
import { aeadSeal } from '../crypto/aead'
import { deriveCommitment, deriveEncKey } from '../crypto/commitment'
import { deriveMasterKey } from '../crypto/kdf'
import { compress } from './compress'
import { serializeHeader } from './header'
import { isTextFilename } from './is-text'
import { serializeRecord } from './record'

export interface SealOptions {
  /** Argon2id parameters; defaults to DEFAULT_KDF. */
  kdf?: KdfParams
  /** Try DEFLATE; keep only if it shrinks the payload. Default true. */
  compress?: boolean
}

/**
 * Build an encrypted container from an inner record (FORMAT.md A.4).
 * Pipeline: record → maybe-compress → XChaCha20-Poly1305 (header as AAD).
 */
export function seal(record: InnerRecord, passphrase: string, opts: SealOptions = {}): Uint8Array {
  const kdf = opts.kdf ?? DEFAULT_KDF
  const salt = randomBytes(SALT_LEN)
  const nonce = randomBytes(NONCE_LEN)

  const masterKey = deriveMasterKey(passphrase, salt, kdf)
  const commit = deriveCommitment(masterKey)
  const encKey = deriveEncKey(masterKey)

  let plaintext = serializeRecord(record)
  let flags = 0
  if (isTextFilename(record.filename))
    flags |= FLAG_IS_TEXT

  if (opts.compress !== false) {
    const deflated = compress(plaintext)
    if (deflated.length < plaintext.length) {
      plaintext = deflated
      flags |= FLAG_COMPRESSED
    }
  }

  const header = serializeHeader({
    version: CONTAINER_VERSION,
    suite: SUITE_ARGON2ID_XCHACHA,
    kdf,
    flags,
    salt,
    commit,
    nonce,
    ctLen: plaintext.length + TAG_LEN,
  })

  const aad = header.subarray(0, HEADER_AAD_LEN)
  const ciphertext = aeadSeal(encKey, nonce, aad, plaintext)

  return concat(header, ciphertext)
}
