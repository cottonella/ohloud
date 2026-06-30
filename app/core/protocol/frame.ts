// Frame assembly + parsing (FORMAT.md B.2). v1 frame:
//   [chirp sync] [header MFSK] [payload MFSK]
// The chirp is located by FFT cross-correlation (self-syncing); the heavily
// RS-protected header then gives the exact payload length. Explicit START/END
// and preamble marker tones are a later robustness add for the live receiver.

import type { WireHeader } from './wire-header'
import { crossCorrelate, synthChirp } from '../dsp/chirp'
import { bytesPerSymbol, DEFAULT_MFSK, demodulateMfsk, modulateMfsk, symbolSamples } from '../dsp/mfsk'
import { decodeWireHeader, HEADER_CODED_LEN } from './wire-header'

export const SAMPLE_RATE = 48000
export const CHIRP_F0 = 1500
export const CHIRP_F1 = 8000
export const CHIRP_LEN = Math.round(0.15 * SAMPLE_RATE) // 7200 samples (150 ms)
const CHIRP_AMP = 0.8

const SYM = symbolSamples(DEFAULT_MFSK)
const HEADER_SYMBOLS = Math.ceil(HEADER_CODED_LEN / bytesPerSymbol(DEFAULT_MFSK))
const RS_BLOCK = 255

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

function chirpTemplate(): Float32Array {
  return synthChirp(CHIRP_F0, CHIRP_F1, CHIRP_LEN, SAMPLE_RATE)
}

/** Build the transmittable PCM frame from the RS-coded header and FEC payload. */
export function assembleFrame(headerCoded: Uint8Array, fecData: Uint8Array): Float32Array {
  const chirp = synthChirp(CHIRP_F0, CHIRP_F1, CHIRP_LEN, SAMPLE_RATE, CHIRP_AMP)
  return concatFloat32([chirp, modulateMfsk(headerCoded), modulateMfsk(fecData)])
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
export function parseFrame(pcm: Float32Array, maxSearchSamples?: number): ParsedFrame {
  const template = chirpTemplate()
  const searchLen = maxSearchSamples === undefined
    ? pcm.length
    : Math.min(pcm.length, maxSearchSamples + CHIRP_LEN)
  const { offset } = crossCorrelate(pcm.subarray(0, searchLen), template)

  const headerOff = offset + CHIRP_LEN
  const headerCoded = demodulateMfsk(pcm.subarray(headerOff, headerOff + HEADER_SYMBOLS * SYM), HEADER_CODED_LEN)
  const header = decodeWireHeader(headerCoded)

  const payloadOff = headerOff + HEADER_SYMBOLS * SYM
  const payloadBytes = RS_BLOCK * header.blockCount
  const payloadSymbols = Math.ceil(payloadBytes / bytesPerSymbol(DEFAULT_MFSK))
  const fecData = demodulateMfsk(pcm.subarray(payloadOff, payloadOff + payloadSymbols * SYM), payloadBytes)

  return { header, fecData, chirpOffset: offset }
}
