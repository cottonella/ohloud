import { describe, expect, it } from 'vitest'
import { peak, rms } from './level'

describe('audio level', () => {
  it('rms of silence is zero, of a full-scale tone ~0.707', () => {
    expect(rms(new Float32Array(100))).toBe(0)
    const tone = new Float32Array(1000)
    for (let i = 0; i < tone.length; i++)
      tone[i] = Math.sin((2 * Math.PI * 50 * i) / 1000)
    expect(rms(tone)).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('peak finds the largest magnitude', () => {
    expect(peak(new Float32Array([0.1, -0.9, 0.3]))).toBeCloseTo(0.9, 6)
    expect(peak(new Float32Array(10))).toBe(0)
  })
})
