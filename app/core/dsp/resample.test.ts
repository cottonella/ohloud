import { describe, expect, it } from 'vitest'
import { resample } from './resample'

function tone(freq: number, rate: number, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++)
    out[i] = Math.sin((2 * Math.PI * freq * i) / rate)
  return out
}

// RMS error over the steady interior (skip the windowed kernel's tapered edges).
function interiorRms(a: Float32Array, b: Float32Array, skip: number): number {
  let s = 0
  let n = 0
  for (let i = skip; i < Math.min(a.length, b.length) - skip; i++) {
    const d = a[i]! - b[i]!
    s += d * d
    n++
  }
  return Math.sqrt(s / n)
}

describe('resample (windowed-sinc)', () => {
  it('returns a copy when the rate is unchanged', () => {
    const x = tone(1000, 48000, 1000)
    const y = resample(x, 48000, 48000)
    expect(y).not.toBe(x)
    expect([...y]).toEqual([...x])
  })

  it('preserves a tone’s physical frequency downsampling 48k → 44.1k', () => {
    const x = tone(3000, 48000, 4800)
    const y = resample(x, 48000, 44100)
    expect(y.length).toBe(4410) // round(4800 · 44100/48000)
    expect(interiorRms(y, tone(3000, 44100, y.length), 200)).toBeLessThan(0.05)
  })

  it('preserves a tone upsampling 44.1k → 48k', () => {
    const x = tone(5000, 44100, 4410)
    const y = resample(x, 44100, 48000)
    expect(interiorRms(y, tone(5000, 48000, y.length), 200)).toBeLessThan(0.05)
  })

  it('round-trips 48k → 44.1k → 48k with low error', () => {
    const x = tone(4000, 48000, 9600)
    const back = resample(resample(x, 48000, 44100), 44100, 48000)
    expect(interiorRms(x, back, 300)).toBeLessThan(0.05)
  })
})
