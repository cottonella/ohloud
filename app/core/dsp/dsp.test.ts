import { describe, expect, it } from 'vitest'
import { matchedFilter, synthChirp } from './chirp'
import { fft, ifft } from './fft'
import { goertzelPower } from './goertzel'
import { addBinTone } from './tone'
import { hann } from './window'

describe('fFT', () => {
  it('peaks at the bin of a pure cosine', () => {
    const n = 8
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++)
      re[i] = Math.cos((2 * Math.PI * 2 * i) / n) // bin 2
    fft(re, im)
    const mag = (k: number) => Math.hypot(re[k]!, im[k]!)
    expect(mag(2)).toBeCloseTo(4, 5) // N/2
    expect(mag(1)).toBeCloseTo(0, 5)
    expect(mag(3)).toBeCloseTo(0, 5)
  })

  it('ifft inverts fft', () => {
    const n = 16
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    const orig: number[] = []
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i) + (i % 3)
      orig.push(re[i]!)
    }
    fft(re, im)
    ifft(re, im)
    for (let i = 0; i < n; i++)
      expect(re[i]!).toBeCloseTo(orig[i]!, 6)
  })
})

describe('window', () => {
  it('hann is symmetric with zero ends', () => {
    const w = hann(9)
    expect(w[0]!).toBeCloseTo(0, 6)
    expect(w[8]!).toBeCloseTo(0, 6)
    expect(w[4]!).toBeCloseTo(1, 6)
    expect(w[1]!).toBeCloseTo(w[7]!, 6)
  })
})

describe('goertzel', () => {
  it('detects the correct bin', () => {
    const n = 512
    const buf = new Float32Array(n)
    addBinTone(buf, 0, n, 40, n, 1)
    expect(goertzelPower(buf, 40, n)).toBeGreaterThan(goertzelPower(buf, 41, n) * 1000)
  })
})

describe('chirp matched filter', () => {
  it('locates the sweep at the right offset under noise', () => {
    const template = synthChirp(1500, 5000, 512, 48000)
    const signal = new Float32Array(2000)
    const offset = 700
    // light deterministic noise everywhere
    let x = 99
    const noise = () => {
      x = (x * 1103515245 + 12345) & 0x7FFFFFFF
      return ((x >>> 10) / 0x1FFFFF - 0.5) * 0.2
    }
    for (let i = 0; i < signal.length; i++)
      signal[i] = noise()
    for (let i = 0; i < template.length; i++)
      signal[offset + i] = signal[offset + i]! + template[i]!

    const m = matchedFilter(signal, template)
    expect(m.offset).toBe(offset)
    expect(m.score).toBeGreaterThan(0.8)
  })
})
