// Tone synthesis on exact FFT bins. A bin's frequency is `bin · sampleRate /
// fftSize`, so its angular step per sample is simply `2π · bin / fftSize` — and
// it lands precisely on a DFT/Goertzel bin for clean detection.

/** Add a sinusoid at `bin` into `out[offset .. offset+length)`. */
export function addBinTone(
  out: Float32Array,
  offset: number,
  length: number,
  bin: number,
  fftSize: number,
  amp: number,
  phase = 0,
): void {
  const w = (2 * Math.PI * bin) / fftSize
  for (let i = 0; i < length; i++)
    out[offset + i] = out[offset + i]! + amp * Math.sin(w * i + phase)
}
