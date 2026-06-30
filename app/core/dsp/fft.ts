// In-place iterative radix-2 Cooley–Tukey FFT (size must be a power of two).
// Used by the OFDM modem; MFSK detection uses Goertzel instead.

function transform(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length
  if (n === 0)
    return
  if ((n & (n - 1)) !== 0)
    throw new Error('FFT size must be a power of two')

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1)
      j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cwr = 1
      let cwi = 0
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k
        const b = a + (len >> 1)
        const vr = re[b]! * cwr - im[b]! * cwi
        const vi = re[b]! * cwi + im[b]! * cwr
        re[b] = re[a]! - vr
        im[b] = im[a]! - vi
        re[a] = re[a]! + vr
        im[a] = im[a]! + vi
        const ncwr = cwr * wr - cwi * wi
        cwi = cwr * wi + cwi * wr
        cwr = ncwr
      }
    }
  }
}

/** Forward FFT, in place. */
export function fft(re: Float64Array, im: Float64Array): void {
  transform(re, im, false)
}

/** Inverse FFT, in place (normalized by 1/n). */
export function ifft(re: Float64Array, im: Float64Array): void {
  transform(re, im, true)
  const n = re.length
  for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n
    im[i] = im[i]! / n
  }
}
