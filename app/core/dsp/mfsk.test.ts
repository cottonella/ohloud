import { describe, expect, it } from 'vitest'
import { fecDecode, fecEncode } from '../fec/blocks'
import { demodulateMfsk, modulateMfsk } from './mfsk'

function seqBytes(n: number, start = 0): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    out[i] = (start + i * 37) & 0xFF
  return out
}

// Deterministic ~uniform noise added in place.
function addNoise(pcm: Float32Array, amp: number, seed: number): void {
  let x = seed >>> 0
  for (let i = 0; i < pcm.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7FFFFFFF
    pcm[i] = pcm[i]! + ((x >>> 10) / 0x1FFFFF - 0.5) * 2 * amp
  }
}

describe('mFSK modem', () => {
  it('round-trips clean bytes (whole symbols)', () => {
    const data = seqBytes(300, 5) // multiple of 3
    const pcm = modulateMfsk(data)
    expect([...demodulateMfsk(pcm, data.length)]).toEqual([...data])
  })

  it('pads and trims a non-multiple length', () => {
    const data = seqBytes(100, 1) // not a multiple of 3
    const pcm = modulateMfsk(data)
    expect([...demodulateMfsk(pcm, data.length)]).toEqual([...data])
  })

  it('decodes through moderate noise', () => {
    const data = seqBytes(150, 9)
    const pcm = modulateMfsk(data)
    addNoise(pcm, 0.05, 4242)
    expect([...demodulateMfsk(pcm, data.length)]).toEqual([...data])
  })
})

describe('fEC + MFSK channel (no crypto)', () => {
  it('recovers a blob through noise and a burst dropout', () => {
    const blob = seqBytes(400, 3)
    const { data, meta } = fecEncode(blob) // RS(255,191) + interleave

    const pcm = modulateMfsk(data)
    addNoise(pcm, 0.06, 1234)
    // Knock out a contiguous chunk of audio (a "cough"); interleaving + RS heal it.
    for (let i = 20000; i < 26000; i++)
      pcm[i] = 0

    const demod = demodulateMfsk(pcm, data.length)
    expect([...fecDecode(demod, meta)]).toEqual([...blob])
  })
})
