// Windowed-sinc (Hann) sample-rate converter. Moves the Fast OFDM payload between
// the device AudioContext rate and OFDM's canonical 48 kHz grid, so a 48 kHz
// sender and a 44.1 kHz receiver interoperate. Physical frequencies are preserved;
// when downsampling, the sinc cutoff drops to the output Nyquist to anti-alias.
// Pure JS, no dependencies.

function sinc(x: number): number {
  if (x === 0)
    return 1
  const pix = Math.PI * x
  return Math.sin(pix) / pix
}

/**
 * Resample `input` from `fromRate` to `toRate` with a Hann-windowed sinc kernel.
 * `lobes` trades quality for cost (sinc zero-crossings per side; 16 keeps even
 * 64-QAM clean). Output length is `round(input.length · toRate / fromRate)`.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number, lobes = 16): Float32Array {
  if (fromRate === toRate || input.length === 0)
    return input.slice()

  const ratio = toRate / fromRate
  const outLen = Math.max(1, Math.round(input.length * ratio))
  const out = new Float32Array(outLen)
  // Cutoff in cycles per input sample (input Nyquist = 0.5, normalized to 1 here).
  // Lower it when downsampling so the kernel band-limits to the output Nyquist.
  const cutoff = Math.min(1, ratio)
  const half = Math.max(1, Math.ceil(lobes / cutoff))

  for (let n = 0; n < outLen; n++) {
    const t = n / ratio // position in input samples (fractional)
    const center = Math.floor(t)
    let sum = 0
    let norm = 0
    for (let k = center - half + 1; k <= center + half; k++) {
      if (k < 0 || k >= input.length)
        continue
      const x = t - k
      const u = x / half
      if (u <= -1 || u >= 1)
        continue
      const w = sinc(cutoff * x) * 0.5 * (1 + Math.cos(Math.PI * u)) // Hann window
      sum += input[k]! * w
      norm += w
    }
    out[n] = norm > 0 ? sum / norm : 0
  }
  return out
}
