// Windowing helpers.

/** Symmetric Hann window of length n. */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n)
  if (n === 1) {
    w[0] = 1
    return w
  }
  for (let i = 0; i < n; i++)
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}

/**
 * Apply a raised-cosine fade in/out over `ramp` samples at each end, in place.
 * Suppresses clicks and spectral splatter at symbol boundaries.
 */
export function applyRaisedCosineRamp(buf: Float32Array, ramp: number): void {
  const n = buf.length
  const r = Math.min(ramp, n >> 1)
  for (let i = 0; i < r; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * (i + 1)) / (r + 1))
    buf[i] = buf[i]! * g
    buf[n - 1 - i] = buf[n - 1 - i]! * g
  }
}
