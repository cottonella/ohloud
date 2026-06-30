// Linear chirp (frequency sweep) for the sync preamble, plus a matched-filter
// detector. Correlating against the known sweep gives a sharp timing peak even
// in reverberant rooms and at an unknown start time (FORMAT.md B.2).

import { fft, ifft } from './fft'
import { applyRaisedCosineRamp } from './window'

/** Synthesize a linear chirp from f0 → f1 over `length` samples. */
export function synthChirp(
  f0: number,
  f1: number,
  length: number,
  sampleRate: number,
  amp = 1,
  ramp = Math.floor(length / 16),
): Float32Array {
  const out = new Float32Array(length)
  const T = length / sampleRate
  const rate = (f1 - f0) / (2 * T)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    out[i] = amp * Math.sin(2 * Math.PI * (f0 * t + rate * t * t))
  }
  if (ramp > 0)
    applyRaisedCosineRamp(out, ramp)
  return out
}

export interface MatchResult {
  /** Best start offset of the template within the signal. */
  offset: number
  /** Normalized correlation score in [-1, 1] at that offset. */
  score: number
}

/**
 * Slide `template` across `signal` and return the offset of peak normalized
 * cross-correlation. Score ≈ 1 at a clean match.
 */
export function matchedFilter(signal: Float32Array, template: Float32Array): MatchResult {
  let tEnergy = 0
  for (let i = 0; i < template.length; i++)
    tEnergy += template[i]! * template[i]!
  const tNorm = Math.sqrt(tEnergy) || 1e-12

  let bestOffset = -1
  let bestScore = Number.NEGATIVE_INFINITY
  const last = signal.length - template.length
  for (let off = 0; off <= last; off++) {
    let dot = 0
    let sEnergy = 0
    for (let i = 0; i < template.length; i++) {
      const s = signal[off + i]!
      dot += s * template[i]!
      sEnergy += s * s
    }
    const score = dot / (Math.sqrt(sEnergy) * tNorm + 1e-12)
    if (score > bestScore) {
      bestScore = score
      bestOffset = off
    }
  }
  return { offset: bestOffset, score: bestScore }
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n)
    p <<= 1
  return p
}

/**
 * FFT-based cross-correlation — returns the offset of peak correlation of
 * `template` within `signal`, in O(n log n). Used to locate the sync chirp in a
 * long recording, where the direct O(n·m) matched filter would be too slow.
 */
export function crossCorrelate(signal: Float32Array, template: Float32Array): { offset: number, peak: number } {
  const n = nextPow2(signal.length + template.length)
  const sRe = new Float64Array(n)
  const sIm = new Float64Array(n)
  const tRe = new Float64Array(n)
  const tIm = new Float64Array(n)
  for (let i = 0; i < signal.length; i++)
    sRe[i] = signal[i]!
  for (let i = 0; i < template.length; i++)
    tRe[i] = template[i]!

  fft(sRe, sIm)
  fft(tRe, tIm)
  // S · conj(T)
  for (let i = 0; i < n; i++) {
    const re = sRe[i]! * tRe[i]! + sIm[i]! * tIm[i]!
    const im = sIm[i]! * tRe[i]! - sRe[i]! * tIm[i]!
    sRe[i] = re
    sIm[i] = im
  }
  ifft(sRe, sIm)

  let best = 0
  let peak = Number.NEGATIVE_INFINITY
  const last = signal.length - template.length
  for (let k = 0; k <= last; k++) {
    if (sRe[k]! > peak) {
      peak = sRe[k]!
      best = k
    }
  }
  return { offset: best, peak }
}
