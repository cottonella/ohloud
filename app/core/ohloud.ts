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
import { open } from './container/open'
import { sealFile, sealText } from './container/text'
import { CorruptedError, UnsupportedError } from './errors'
import { fecDecode, FecDecodeError, fecEncode } from './fec/blocks'
import { assembleFrame, DEFAULT_SAMPLE_RATE, parseFrame } from './protocol/frame'
import { encodeWireHeader, FEC_RS, MODE_MFSK, WIRE_VERSION } from './protocol/wire-header'

export interface EncodeOptions {
  /** Argon2id parameters (forwarded to the container). */
  kdf?: KdfParams
  /** Try DEFLATE on the payload (default true). */
  compress?: boolean
  /** Reed–Solomon parity bytes per 255-byte FEC block (default 64). */
  fecNsym?: number
  /** Sample rate of the AudioContext that will play this PCM (default 48000). */
  sampleRate?: number
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

function encodeBlob(blob: Uint8Array, fecNsym: number, sampleRate: number): EncodeResult {
  const { data: fecData, meta } = fecEncode(blob, { nsym: fecNsym })
  const headerCoded = encodeWireHeader({
    protoVer: WIRE_VERSION,
    mode: MODE_MFSK,
    fec: FEC_RS,
    flags: 0,
    blobLen: blob.length,
    blockCount: meta.blockCount,
    fecNsym,
    tailHash: tailHash(blob),
  })
  const pcm = assembleFrame(headerCoded, fecData, sampleRate)
  return { pcm, sampleRate, durationSec: pcm.length / sampleRate, containerBytes: blob.length }
}

/** Encode a UTF-8 text message into a transmittable PCM frame. */
export function encodeText(text: string, passphrase: string, opts: EncodeOptions = {}): EncodeResult {
  const blob = sealText(text, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? 64, opts.sampleRate ?? DEFAULT_SAMPLE_RATE)
}

/** Encode arbitrary file bytes into a transmittable PCM frame. */
export function encodeFile(filename: string, content: Uint8Array, passphrase: string, opts: EncodeOptions = {}): EncodeResult {
  const blob = sealFile(filename, content, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? 64, opts.sampleRate ?? DEFAULT_SAMPLE_RATE)
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
  if (header.mode !== MODE_MFSK)
    throw new UnsupportedError(`transmission mode ${header.mode}`)

  let blob: Uint8Array
  try {
    blob = fecDecode(fecData, { origLen: header.blobLen, blockCount: header.blockCount, nsym: header.fecNsym })
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
