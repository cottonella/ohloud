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
import { encodeWireHeader, FEC_RS, FEC_RS_FOUNTAIN, MODE_MFSK, MODE_OFDM_QPSK, modeIsKnown, WIRE_VERSION } from './protocol/wire-header'

/** Robust MFSK (slow, very sturdy) or Fast OFDM (QPSK — higher rate, wants a cleaner channel). */
export type TransmitMode = 'robust' | 'fast'

function modeByte(mode: TransmitMode): number {
  // QPSK is the Fast default: ~10–30× lower BER than 16-QAM through real room
  // reverb + band-limiting, and still many times faster than Robust MFSK.
  return mode === 'fast' ? MODE_OFDM_QPSK : MODE_MFSK
}

export interface EncodeOptions {
  /** Argon2id parameters (forwarded to the container). */
  kdf?: KdfParams
  /** Try DEFLATE on the payload (default true). */
  compress?: boolean
  /** Reed–Solomon parity bytes per 255-byte FEC block (default 64). */
  fecNsym?: number
  /** Sample rate of the AudioContext that will play this PCM (default 48000). */
  sampleRate?: number
  /** Transmission speed/robustness tier (default `'robust'`). */
  mode?: TransmitMode
  /** Fraction of RaptorQ repair blocks so lost blocks heal (default 0 for text, 0.25 for files). */
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

const FEC_PAYLOAD_PER_BLOCK = 255 - 64 - 2 // default nsym=64 + 2-byte block CRC

/**
 * Estimate transmission length in seconds for a payload of `payloadBytes`,
 * without encrypting (drives the UI's "how long" indicator). Ignores
 * compression, so it's an upper bound for text.
 */
export function estimateDurationSec(payloadBytes: number, filenameBytes = 16, sampleRate = DEFAULT_SAMPLE_RATE, mode: TransmitMode = 'robust', repair = 0): number {
  const recordLen = 1 + 2 + filenameBytes + 8 + 32 + payloadBytes
  const blobLen = HEADER_LEN + recordLen + TAG_LEN
  const sourceBlocks = Math.max(1, Math.ceil(blobLen / FEC_PAYLOAD_PER_BLOCK))
  const blockCount = sourceBlocks + (repair ? Math.ceil(repair * sourceBlocks) : 0)
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
  const blob = sealText(text, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? 64, opts.sampleRate ?? DEFAULT_SAMPLE_RATE, opts.mode ?? 'robust', opts.repair ?? 0)
}

/** Encode arbitrary file bytes into a transmittable PCM frame. */
export function encodeFile(filename: string, content: Uint8Array, passphrase: string, opts: EncodeOptions = {}): EncodeResult {
  const blob = sealFile(filename, content, passphrase, { kdf: opts.kdf, compress: opts.compress })
  return encodeBlob(blob, opts.fecNsym ?? 64, opts.sampleRate ?? DEFAULT_SAMPLE_RATE, opts.mode ?? 'robust', opts.repair ?? 0.25)
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
