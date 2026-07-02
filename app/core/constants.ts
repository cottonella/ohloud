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
 * Production default. 2^15 KiB = 32 MiB, t=3, p=1 (pure-JS is single-threaded,
 * so lanes>1 only adds sequential cost). Measured ~2 s on a mid laptop in the
 * §16 calibration pass — within the 1–3 s target, and well above OWASP's 19 MiB
 * baseline. Override per-call for tests.
 */
export const DEFAULT_KDF: KdfParams = { memLog2: 15, time: 3, lanes: 1 }

/**
 * Bounds the receiver enforces on a container's Argon2id params *before* running
 * the KDF. The header is attacker-craftable (a hostile transmission can set any
 * bytes here), and `open()` derives the key before authenticating — so without
 * these caps a single crafted sound clip could request `2^255` KiB of memory
 * (instant OOM) or degenerate params that throw an untyped error. The window is
 * generous: it accepts the 32 MiB / t=3 default with headroom, and rejects only
 * the abusive extremes. `KDF_MAX_MEM_LOG2 = 18` ⇒ a 256 MiB ceiling (8× default).
 */
export const KDF_MIN_MEM_LOG2 = 8 // 256 KiB floor — also keeps 2^memLog2 ≥ 8·lanes
export const KDF_MAX_MEM_LOG2 = 18 // 256 MiB ceiling — blocks the memory bomb
export const KDF_MAX_TIME = 16
export const KDF_MAX_LANES = 4
