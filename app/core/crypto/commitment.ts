import { bytesEqualCT } from '../bytes'
import { HKDF_COMMIT_INFO, HKDF_ENC_INFO } from '../constants'
import { hkdfSha256 } from './hkdf'

/**
 * Key-commitment value, published in the header. Lets the receiver detect a
 * wrong passphrase gracefully and closes invisible-salamander / partitioning-
 * oracle attacks (XChaCha20-Poly1305 is not key-committing on its own).
 */
export function deriveCommitment(masterKey: Uint8Array): Uint8Array {
  return hkdfSha256(masterKey, HKDF_COMMIT_INFO, 32)
}

/** The actual AEAD key, domain-separated from the commitment. */
export function deriveEncKey(masterKey: Uint8Array): Uint8Array {
  return hkdfSha256(masterKey, HKDF_ENC_INFO, 32)
}

/** Constant-time check of a derived commitment against the published one. */
export function verifyCommitment(masterKey: Uint8Array, expected: Uint8Array): boolean {
  return bytesEqualCT(deriveCommitment(masterKey), expected)
}
