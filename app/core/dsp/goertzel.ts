// Goertzel single-bin power detector — cheaper than a full FFT when you only
// need a handful of known bins (the MFSK candidate tones).

/**
 * Power at DFT bin `k` of an `n`-point window starting at `offset`.
 * For a tone landing exactly on bin `k`, this peaks sharply with near-zero
 * leakage to other exact bins (they are orthogonal over n samples).
 */
export function goertzelPower(
  samples: Float32Array | Float64Array,
  k: number,
  n: number,
  offset = 0,
): number {
  const w = (2 * Math.PI * k) / n
  const coeff = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    const s0 = samples[offset + i]! + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2
}
