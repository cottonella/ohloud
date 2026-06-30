// Audio level helpers for the live mic meter.

/** Root-mean-square level of a sample block (0..~1). */
export function rms(buf: Float32Array): number {
  if (buf.length === 0)
    return 0
  let sum = 0
  for (let i = 0; i < buf.length; i++)
    sum += buf[i]! * buf[i]!
  return Math.sqrt(sum / buf.length)
}

/** Peak absolute amplitude of a sample block (0..~1). */
export function peak(buf: Float32Array): number {
  let p = 0
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]!)
    if (a > p)
      p = a
  }
  return p
}
