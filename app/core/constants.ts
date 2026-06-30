// Container + protocol constants. See FORMAT.md for the authoritative spec.

// ── Container (OHLD) ────────────────────────────────────────────────────────
export const CONTAINER_MAGIC = new Uint8Array([0x4F, 0x48, 0x4C, 0x44]) // "OHLD"
export const CONTAINER_VERSION = 0x01
export const SUITE_ARGON2ID_XCHACHA = 0x01

export const HEADER_LEN = 86
export const SALT_LEN = 16
export const COMMIT_LEN = 32
export const NONCE_LEN = 24
export const TAG_LEN = 16
/** Bytes of the cleartext header bound as AEAD associated data (magic..nonce). */
export const HEADER_AAD_LEN = 82

// Header flags (byte 9)
export const FLAG_IS_TEXT = 0b0000_0001
export const FLAG_COMPRESSED = 0b0000_0010
export const FLAG_FOUNTAIN = 0b0000_0100

// Inner record
export const RECORD_VERSION = 0x01
export const MAX_NAME_LEN = 1024

// Text payload convention
export const TEXT_EXTENSION = '.ohloudtxt'
export const TEXT_FILENAME = `message${TEXT_EXTENSION}`

// HKDF domain-separation labels
export const HKDF_COMMIT_INFO = 'ohloud/commit/v1'
export const HKDF_ENC_INFO = 'ohloud/enc/v1'

/** Argon2id parameters. `memLog2` ⇒ memory = 2^memLog2 KiB. */
export interface KdfParams {
  memLog2: number
  time: number
  lanes: number
}

/**
 * Production default. 2^16 KiB = 64 MiB, t=3, p=1 (pure-JS is single-threaded,
 * so lanes>1 only adds sequential cost). ~3–6 s on a typical laptop; tuned in
 * the calibration pass (TASKS.md §16). Override per-call for tests.
 */
export const DEFAULT_KDF: KdfParams = { memLog2: 16, time: 3, lanes: 1 }
