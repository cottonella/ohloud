import type { Constellation } from './ofdm'
import { describe, expect, it } from 'vitest'
import { multipath, simulateChannel } from '../../../bench/channel'
import { bytesPerOfdmSymbol, demodulateOfdm, modulateOfdm, ofdmConfig } from './ofdm'

function seqBytes(n: number, start = 0): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++)
    out[i] = (start + i * 53) & 0xFF
  return out
}

function ber(a: Uint8Array, b: Uint8Array): number {
  let bits = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    let x = a[i]! ^ b[i]!
    while (x) {
      bits += x & 1
      x >>= 1
    }
  }
  return bits / (n * 8)
}

describe('oFDM round-trip (clean)', () => {
  for (const c of ['qpsk', 'qam16', 'qam64'] as Constellation[]) {
    it(`recovers exactly with ${c}`, () => {
      const cfg = ofdmConfig(c)
      const data = seqBytes(300, 9)
      const out = demodulateOfdm(modulateOfdm(data, cfg), data.length, cfg)
      expect([...out]).toEqual([...data])
    })
  }

  it('packs more bytes per symbol with denser constellations', () => {
    expect(bytesPerOfdmSymbol(ofdmConfig('qam64'))).toBeGreaterThan(bytesPerOfdmSymbol(ofdmConfig('qpsk')))
  })
})

describe('oFDM cyclic prefix vs multipath', () => {
  it('absorbs an echo shorter than the CP (QPSK)', () => {
    const cfg = ofdmConfig('qpsk') // CP = 256 samples
    const data = seqBytes(250, 3)
    // Direct path + a realistic 0.5 ms echo (24 samples, well inside the CP and
    // the pilot-tracking range) → CP prevents ISI, pilots equalize the fading.
    const pcm = multipath(modulateOfdm(data, cfg), [{ delaySamples: 0, gain: 1 }, { delaySamples: 24, gain: 0.5 }])
    expect(ber(demodulateOfdm(pcm, data.length, cfg), data)).toBeLessThan(0.005)
  })

  it('is hurt by an echo longer than the CP', () => {
    const cfg = ofdmConfig('qpsk')
    const data = seqBytes(250, 3)
    // Echo at 400 samples (> 256 CP) → inter-symbol interference.
    const pcm = multipath(modulateOfdm(data, cfg), [{ delaySamples: 0, gain: 1 }, { delaySamples: 400, gain: 0.6 }])
    expect(ber(demodulateOfdm(pcm, data.length, cfg), data)).toBeGreaterThan(0)
  })
})

describe('oFDM noise tolerance (pilots equalize band-limiting)', () => {
  it('qPSK survives 20 dB SNR + band-limiting', () => {
    const cfg = ofdmConfig('qpsk')
    const data = seqBytes(200, 1)
    const pcm = simulateChannel(modulateOfdm(data, cfg), { snrDb: 20, bandLow: 300, bandHigh: 12000, seed: 5 })
    expect(ber(demodulateOfdm(pcm, data.length, cfg), data)).toBeLessThan(0.02)
  })
})
