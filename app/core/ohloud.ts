// End-to-end pipeline tying crypto + container + FEC + modem + framing into a
// single API: text/file + passphrase → PCM, and PCM + passphrase → text/file.
// Sample-rate aware so it works at whatever rate the AudioContext provides.
//
//   encode:  record → seal (AEAD) → FEC blocks → MFSK → chirp-framed PCM
//   decode:  PCM → sync + demod → FEC decode → verify tail hash → open (AEAD)

import type { KdfParams } from './constants'
import type { OpenResult } from './container/open'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesEqualCT } from './bytes'
import { HEADER_LEN, TAG_LEN } from './constants'
import { open } from './container/open'
import { sealFile, sealText } from './container/text'
import { CorruptedError, UnsupportedError } from './errors'
import { fecDecode, FecDecodeError, fecEncode } from './fec/blocks'
import { assembleFrame, chirpSamples, DEFAULT_SAMPLE_RATE, headerSamples, ofdmGuardSamples, parseFrame, payloadSamples } from './protocol/frame'
import { encodeWireHeader, FEC_RS, FEC_RS_FOUNTAIN, MODE_MFSK, MODE_OFDM_QPSK_WIDE, modeIsKnown, WIRE_VERSION } from './protocol/wire-header'

/** Robust MFSK (slow, very sturdy) or Fast OFDM (QPSK — higher rate, wants a cleaner channel). */
export type TransmitMode = 'robust' | 'fast'

function modeByte(mode: TransmitMode): number {
  // QPSK is the Fast default: ~10–30× lower BER than 16-QAM through real room
  // reverb + band-limiting, and still many times faster than Robust MFSK.
  // Fast sends on the wide 10 kHz lane (~1.7× the classic lane's subcarriers;
  // the speed lab measured identical survival through the quiet and normal
  // presets). Receivers still decode the classic MODE_OFDM_QPSK lane.
  return mode === 'fast' ? MODE_OFDM_QPSK_WIDE : MODE_MFSK
}

/**
 * Per-mode FEC policy (bench speed lab, 2026-07). Robust keeps worst-case
 * armor — it exists to survive rooms Fast can't. Fast keeps full RS parity
 * but trims the fountain to 10%: leaner parity (RS48) measured 3/20 failures
 * on tiny payloads through the normal room (few blocks → weak-bin errors
 * concentrate), while RS64+10% swept 20/20 at every size and costs the same
 * airtime as RS48 below ~1 KB (identical block counts).
 */
const FEC_NSYM_BY_MODE: Record<TransmitMode, number> = { robust: 64, fast: 64 }
const REPAIR_BY_MODE: Record<TransmitMode, number> = { robust: 0.25, fast: 0.10 }

export interface EncodeOptions {
  /** Argon2id parameters (forwarded to the container). */
  kdf?: KdfParams
  /** Try DEFLATE on the payload (default true). */
  compress?: boolean
  /** Reed–Solomon parity bytes per 255-byte FEC block (default: per-mode policy). */
  fecNsym?: number
  /** Sample rate of the AudioContext that will play this PCM (default 48000). */
  sampleRate?: number
  /** Transmission speed/robustness tier (default `'robust'`). */
  mode?: TransmitMode
  /** Fraction of RaptorQ repair blocks so lost blocks heal (default: per-mode policy; 0 disables). */
  repair?: number
}

export interface EncodeResult {
  pcm: Float32Array
  sampleRate: number
  /** Transmission length in seconds (drives the UI duration indicator). */
  durationSec: number
  /** Encrypted container size in bytes. */
  containerBytes: number
}

function tailHash(blob: Uint8Array): Uint8Array {
  return sha256(blob).subarray(0, 16)
}

/**
 * Estimate transmission length in seconds for a payload of `payloadBytes`,
 * without encrypting (drives the UI's "how long" indicator). Ignores
 * compression, so it's an upper bound for text. FEC sizing follows the same
 * per-mode policy as the encoders, so the estimate tracks the real frame.
 */
export function estimateDurationSec(payloadBytes: number, filenameBytes = 16, sampleRate = DEFAULT_SAMPLE_RATE, mode: TransmitMode = 'robust', repair?: number): number {
  const recordLen = 1 + 2 + filenameBytes + 8 + 32 + payloadBytes
  const blobLen = HEADER_LEN + recordLen + TAG_LEN
  const perBlock = 255 - FEC_NSYM_BY_MODE[mode] - 2 // RS payload per block (minus the 2-byte CRC)
  const rep = repair ?? REPAIR_BY_MODE[mode]
  const sourceBlocks = Math.max(1, Math.ceil(blobLen / perBlock))
  const blockCount = sourceBlocks + (rep ? Math.ceil(rep * sourceBlocks) : 0)
  const mb = modeByte(mode)
  return (chirpSamples(sampleRate) + headerSamples(sampleRate) + ofdmGuardSamples(sampleRate, mb) + payloadSamples(sampleRate, blockCount, mb)) / sampleRate
}

function encodeBlob(blob: Uint8Array, fecNsym: number, sampleRate: number, mode: TransmitMode, repair: number): EncodeResult {
  const { data: fecData, meta } = fecEncode(blob, { nsym: fecNsym, repair })
  const headerCoded = encodeWireHeader({
    protoVer: WIRE_VERSION,
    mode: modeByte(mode),
    fec: meta.fountain ? FEC_RS_FOUNTAIN : FEC_RS,
    flags: 0,
    blobLen: blob.length,
    blockCount: meta.blockCount,
    fecNsym,
    tailHash: tailHash(blob),
  })
  const pcm = assembleFrame(headerCoded, fecData, sampleRate, modeByte(mode))
  return { pcm, sampleRate, durationSec: pcm.length / sampleRate, containerBytes: blob.length }
}

/** Encode a UTF-8 text message into a transmittable PCM frame. */
export function encodeText(text: string, passphrase: string, opts: EncodeOptions = {}): EncodeResult {
  const mode = opts.mode ?? 'robust'
  const blob = sealText(text, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? FEC_NSYM_BY_MODE[mode], opts.sampleRate ?? DEFAULT_SAMPLE_RATE, mode, opts.repair ?? REPAIR_BY_MODE[mode])
}

/** Encode arbitrary file bytes into a transmittable PCM frame. */
export function encodeFile(filename: string, content: Uint8Array, passphrase: string, opts: EncodeOptions = {}): EncodeResult {
  const mode = opts.mode ?? 'robust'
  const blob = sealFile(filename, content, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? FEC_NSYM_BY_MODE[mode], opts.sampleRate ?? DEFAULT_SAMPLE_RATE, mode, opts.repair ?? REPAIR_BY_MODE[mode])
}

export interface DecodeOptions {
  /** Bound how far into the PCM to search for the sync chirp. */
  maxSearchSamples?: number
  /** Sample rate of the recording (default 48000). */
  sampleRate?: number
}

/**
 * Decode a complete PCM recording back to the original text/file.
 * Throws WrongPassphraseError, CorruptedError, or UnsupportedError.
 */
export function decodePcm(pcm: Float32Array, passphrase: string, opts: DecodeOptions = {}): OpenResult {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE
  const { header, fecData } = parseFrame(pcm, sampleRate, opts.maxSearchSamples)
  if (!modeIsKnown(header.mode))
    throw new UnsupportedError(`transmission mode ${header.mode}`)

  let blob: Uint8Array
  try {
    blob = fecDecode(fecData, { origLen: header.blobLen, blockCount: header.blockCount, nsym: header.fecNsym, fountain: header.fec === FEC_RS_FOUNTAIN })
  }
  catch (e) {
    if (e instanceof FecDecodeError)
      throw new CorruptedError('too many channel errors to recover the transmission')
    throw e
  }

  if (!bytesEqualCT(tailHash(blob), header.tailHash))
    throw new CorruptedError('transmission hash mismatch')

  return open(blob, passphrase)
}
