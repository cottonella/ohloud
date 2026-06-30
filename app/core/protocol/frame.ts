// Frame assembly + parsing (FORMAT.md B.2), sample-rate independent. v1 frame:
//   [chirp sync] [header MFSK] [payload MFSK]
// The chirp is located by FFT cross-correlation (self-syncing); the heavily
// RS-protected header then gives the exact payload length. All durations are
// physical (seconds), so a frame encoded at one rate decodes at another.

import type { MfskConfig } from '../dsp/mfsk'
import type { WireHeader } from './wire-header'
import { crossCorrelate, synthChirp } from '../dsp/chirp'
import { bytesPerSymbol, DEFAULT_MFSK, demodulateMfsk, framesToSamples, mfskConfig, modulateMfsk } from '../dsp/mfsk'
import { decodeWireHeader, HEADER_CODED_LEN } from './wire-header'

export const DEFAULT_SAMPLE_RATE = 48000
export const CHIRP_F0 = 1500
export const CHIRP_F1 = 8000
export const CHIRP_SEC = 0.15 // 150 ms sync chirp
const CHIRP_AMP = 0.8
const RS_BLOCK = 255

// Header symbol count is rate-independent (bytes per symbol doesn't depend on rate).
const HEADER_SYMBOLS = Math.ceil(HEADER_CODED_LEN / bytesPerSymbol(DEFAULT_MFSK))

export function chirpSamples(sampleRate: number): number {
  return Math.round(CHIRP_SEC * sampleRate)
}

export function headerSamples(sampleRate: number): number {
  return framesToSamples(mfskConfig(sampleRate), HEADER_SYMBOLS)
}

export function payloadSamples(sampleRate: number, blockCount: number): number {
  const symbols = Math.ceil((RS_BLOCK * blockCount) / bytesPerSymbol(DEFAULT_MFSK))
  return framesToSamples(mfskConfig(sampleRate), symbols)
}

function concatFloat32(parts: Float32Array[]): Float32Array {
  let total = 0
  for (const p of parts)
    total += p.length
  const out = new Float32Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function chirpTemplate(sampleRate: number): Float32Array {
  return synthChirp(CHIRP_F0, CHIRP_F1, chirpSamples(sampleRate), sampleRate)
}

/** Build the transmittable PCM frame for the given sample rate. */
export function assembleFrame(headerCoded: Uint8Array, fecData: Uint8Array, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  const cfg: MfskConfig = mfskConfig(sampleRate)
  const chirp = synthChirp(CHIRP_F0, CHIRP_F1, chirpSamples(sampleRate), sampleRate, CHIRP_AMP)
  return concatFloat32([chirp, modulateMfsk(headerCoded, cfg), modulateMfsk(fecData, cfg)])
}

/**
 * Locate the sync chirp; returns its absolute offset and a normalized
 * correlation score in [0, 1] (used by the streaming receiver to reject noise).
 */
export function locateChirp(pcm: Float32Array, sampleRate = DEFAULT_SAMPLE_RATE, searchStart = 0, searchEnd = pcm.length): { offset: number, score: number } {
  const template = chirpTemplate(sampleRate)
  const region = pcm.subarray(searchStart, Math.min(pcm.length, searchEnd))
  if (region.length < template.length)
    return { offset: searchStart, score: 0 }

  const { offset } = crossCorrelate(region, template)
  const abs = searchStart + offset

  let dot = 0
  let sE = 0
  let tE = 0
  for (let i = 0; i < template.length; i++) {
    const s = pcm[abs + i] ?? 0
    dot += s * template[i]!
    sE += s * s
    tE += template[i]! * template[i]!
  }
  return { offset: abs, score: dot / (Math.sqrt(sE) * Math.sqrt(tE) + 1e-12) }
}

export interface ParsedFrame {
  header: WireHeader
  fecData: Uint8Array
  /** Sample offset where the sync chirp was found. */
  chirpOffset: number
}

/**
 * Locate the chirp, read the header, then demodulate exactly the payload it
 * describes. `maxSearchSamples` bounds where the chirp is looked for.
 */
export function parseFrame(pcm: Float32Array, sampleRate = DEFAULT_SAMPLE_RATE, maxSearchSamples?: number): ParsedFrame {
  const cfg = mfskConfig(sampleRate)
  const cLen = chirpSamples(sampleRate)
  const hSamples = headerSamples(sampleRate)
  const searchEnd = maxSearchSamples === undefined ? pcm.length : Math.min(pcm.length, maxSearchSamples + cLen)
  const { offset } = locateChirp(pcm, sampleRate, 0, searchEnd)

  const headerOff = offset + cLen
  const headerCoded = demodulateMfsk(pcm.subarray(headerOff, headerOff + hSamples), HEADER_CODED_LEN, cfg)
  const header = decodeWireHeader(headerCoded)

  const payloadOff = headerOff + hSamples
  const payloadBytes = RS_BLOCK * header.blockCount
  const fecData = demodulateMfsk(pcm.subarray(payloadOff, payloadOff + payloadSamples(sampleRate, header.blockCount)), payloadBytes, cfg)

  return { header, fecData, chirpOffset: offset }
}
