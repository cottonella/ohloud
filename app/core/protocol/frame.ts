// Frame assembly + parsing (FORMAT.md B.2), sample-rate independent. v1 frame:
//   [chirp sync] [header MFSK] [payload MFSK]
// The chirp is located by FFT cross-correlation (self-syncing); the heavily
// RS-protected header then gives the exact payload length. All durations are
// physical (seconds), so a frame encoded at one rate decodes at another.

import type { MfskConfig } from '../dsp/mfsk'
import type { WireHeader } from './wire-header'
import { crossCorrelate, synthChirp } from '../dsp/chirp'
import { bytesPerSymbol, DEFAULT_MFSK, demodulateMfsk, framesToSamples, mfskConfig, modulateMfsk } from '../dsp/mfsk'
import { demodulateOfdm, modulateOfdm, OFDM_RATE, ofdmConfig, ofdmPayloadSamples } from '../dsp/ofdm'
import { resample } from '../dsp/resample'
import { decodeWireHeader, HEADER_CODED_LEN, MODE_MFSK, modeConstellation, modeIsOfdm } from './wire-header'

export const DEFAULT_SAMPLE_RATE = 48000
export const CHIRP_F0 = 1500
export const CHIRP_F1 = 8000
export const CHIRP_SEC = 0.15 // 150 ms sync chirp
const CHIRP_AMP = 0.8
const RS_BLOCK = 255

// Header symbol count is rate-independent (bytes per symbol doesn't depend on rate).
const HEADER_SYMBOLS = Math.ceil(HEADER_CODED_LEN / bytesPerSymbol(DEFAULT_MFSK))

// Silence between the header and an OFDM payload so the loud chirp + header
// reverb decays before the coherent OFDM symbols start (real rooms ring far
// longer than the cyclic prefix). Robust MFSK is non-coherent and needs none.
export const OFDM_GUARD_SEC = 0.15

export function ofdmGuardSamples(sampleRate: number, mode: number): number {
  return modeIsOfdm(mode) ? Math.round(OFDM_GUARD_SEC * sampleRate) : 0
}

export function chirpSamples(sampleRate: number): number {
  return Math.round(CHIRP_SEC * sampleRate)
}

export function headerSamples(sampleRate: number): number {
  return framesToSamples(mfskConfig(sampleRate), HEADER_SYMBOLS)
}

export function payloadSamples(sampleRate: number, blockCount: number, mode: number = MODE_MFSK): number {
  const bytes = RS_BLOCK * blockCount
  if (modeIsOfdm(mode)) {
    // OFDM is generated at OFDM_RATE; on the air it occupies the same physical
    // time, which is this many samples at the device rate.
    const need = ofdmPayloadSamples(bytes, ofdmConfig(modeConstellation(mode)))
    return Math.round((need * sampleRate) / OFDM_RATE)
  }
  const symbols = Math.ceil(bytes / bytesPerSymbol(DEFAULT_MFSK))
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
export function assembleFrame(headerCoded: Uint8Array, fecData: Uint8Array, sampleRate = DEFAULT_SAMPLE_RATE, mode: number = MODE_MFSK): Float32Array {
  const cfg: MfskConfig = mfskConfig(sampleRate)
  const chirp = synthChirp(CHIRP_F0, CHIRP_F1, chirpSamples(sampleRate), sampleRate, CHIRP_AMP)
  const header = modulateMfsk(headerCoded, cfg)
  if (!modeIsOfdm(mode))
    return concatFloat32([chirp, header, modulateMfsk(fecData, cfg)])

  // Synthesize on OFDM's canonical 48 kHz grid, then resample to the device rate
  // so the whole frame shares one rate (physical tones are preserved).
  const canonical = modulateOfdm(fecData, ofdmConfig(modeConstellation(mode)))
  const payload = sampleRate === OFDM_RATE ? canonical : resample(canonical, OFDM_RATE, sampleRate)
  const guard = new Float32Array(ofdmGuardSamples(sampleRate, mode))
  return concatFloat32([chirp, header, guard, payload])
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

  const payloadOff = headerOff + hSamples + ofdmGuardSamples(sampleRate, header.mode)
  const payloadBytes = RS_BLOCK * header.blockCount
  let fecData: Uint8Array
  if (modeIsOfdm(header.mode)) {
    const ocfg = ofdmConfig(modeConstellation(header.mode))
    const need = ofdmPayloadSamples(payloadBytes, ocfg) // samples at OFDM_RATE
    if (sampleRate === OFDM_RATE) {
      // Hand the demod a lead margin (into the guard) before the nominal start so
      // its cyclic-prefix timing sync can lock onto the true symbol boundary.
      const lead = Math.min(payloadOff, ocfg.cpSize)
      fecData = demodulateOfdm(pcm.subarray(payloadOff - lead, payloadOff + need), payloadBytes, ocfg)
    }
    else {
      // Resample the payload back onto OFDM's 48 kHz grid, with lead + tail margin
      // so the resampler edges and the demod's CP timing sync both have slack.
      const regionLen = payloadSamples(sampleRate, header.blockCount, header.mode)
      const margin = Math.round(((ocfg.fftSize + ocfg.cpSize) * sampleRate) / OFDM_RATE)
      const lead = Math.min(payloadOff, Math.round((ocfg.cpSize * sampleRate) / OFDM_RATE))
      const to = Math.min(pcm.length, payloadOff + regionLen + margin)
      fecData = demodulateOfdm(resample(pcm.subarray(payloadOff - lead, to), sampleRate, OFDM_RATE), payloadBytes, ocfg)
    }
  }
  else {
    const region = pcm.subarray(payloadOff, payloadOff + payloadSamples(sampleRate, header.blockCount, header.mode))
    fecData = demodulateMfsk(region, payloadBytes, cfg)
  }

  return { header, fecData, chirpOffset: offset }
}
