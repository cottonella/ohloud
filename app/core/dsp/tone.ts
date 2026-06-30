// Tone synthesis in physical units. A tone of `freqHz` advances by
// `2π·freqHz/sampleRate` radians per sample, so the same protocol frequencies
// can be generated at any sample rate (the key to cross-device interop).

/** Add a sinusoid at `freqHz` into `out[offset .. offset+length)`. */
export function addTone(
  out: Float32Array,
  offset: number,
  length: number,
  freqHz: number,
  sampleRate: number,
  amp: number,
  phase = 0,
): void {
  const w = (2 * Math.PI * freqHz) / sampleRate
  for (let i = 0; i < length; i++)
    out[offset + i] = out[offset + i]! + amp * Math.sin(w * i + phase)
}

/** Convenience: a tone at FFT bin `bin` of an `fftSize`-point transform. */
export function addBinTone(
  out: Float32Array,
  offset: number,
  length: number,
  bin: number,
  fftSize: number,
  amp: number,
  phase = 0,
): void {
  addTone(out, offset, length, bin, fftSize, amp, phase)
}
