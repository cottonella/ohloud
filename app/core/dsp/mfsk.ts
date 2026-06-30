// Robust MFSK modem (FORMAT.md B.5). Each symbol carries `groups` tones drawn
// from `groups` adjacent 16-bin bands; one tone per band encodes a nibble.
// Default geometry: 6 groups × 16 bins = 24 bits = 3 bytes per symbol, tones on
// exact FFT bins (F0 = 1875 Hz → bin 40). Detection is per-band Goertzel argmax.

import { goertzelPower } from './goertzel'
import { addBinTone } from './tone'
import { applyRaisedCosineRamp } from './window'

export interface MfskConfig {
  sampleRate: number
  fftSize: number
  /** FFT bin of the lowest tone (F0 / dF). 1875 / 46.875 = 40. */
  baseBin: number
  groups: number
  binsPerGroup: number
  /** Steady analysis window = fftSize; guards add `ramp` samples each side. */
  ramp: number
  amplitude: number
}

export const DEFAULT_MFSK: MfskConfig = {
  sampleRate: 48000,
  fftSize: 1024,
  baseBin: 40,
  groups: 6,
  binsPerGroup: 16,
  ramp: 64,
  amplitude: 0.8,
}

function bitsPerGroup(cfg: MfskConfig): number {
  return Math.log2(cfg.binsPerGroup)
}

export function bytesPerSymbol(cfg: MfskConfig): number {
  return (cfg.groups * bitsPerGroup(cfg)) / 8
}

export function symbolSamples(cfg: MfskConfig): number {
  return cfg.fftSize + 2 * cfg.ramp
}

// Read `groups` values of `bitsPerGroup` bits each, MSB-first, from a byte block.
function readSymbolValues(bytes: Uint8Array, off: number, cfg: MfskConfig): number[] {
  const bpg = bitsPerGroup(cfg)
  const values: number[] = []
  let bit = 0
  for (let g = 0; g < cfg.groups; g++) {
    let v = 0
    for (let b = 0; b < bpg; b++) {
      const byteIdx = off + (bit >> 3)
      const bitIdx = 7 - (bit & 7)
      v = (v << 1) | ((bytes[byteIdx]! >> bitIdx) & 1)
      bit++
    }
    values.push(v)
  }
  return values
}

function writeSymbolValues(values: number[], bytes: Uint8Array, off: number, cfg: MfskConfig): void {
  const bpg = bitsPerGroup(cfg)
  let bit = 0
  for (let g = 0; g < cfg.groups; g++) {
    const v = values[g]!
    for (let b = bpg - 1; b >= 0; b--) {
      if ((v >> b) & 1) {
        const byteIdx = off + (bit >> 3)
        const bitIdx = 7 - (bit & 7)
        bytes[byteIdx] = bytes[byteIdx]! | (1 << bitIdx)
      }
      bit++
    }
  }
}

/** Modulate bytes into PCM. Length is padded up to a whole number of symbols. */
export function modulateMfsk(data: Uint8Array, cfg: MfskConfig = DEFAULT_MFSK): Float32Array {
  const bps = bytesPerSymbol(cfg)
  const symSamples = symbolSamples(cfg)
  const numSymbols = Math.max(1, Math.ceil(data.length / bps))

  const padded = new Uint8Array(numSymbols * bps)
  padded.set(data)

  const out = new Float32Array(numSymbols * symSamples)
  const toneAmp = cfg.amplitude / cfg.groups

  for (let s = 0; s < numSymbols; s++) {
    const values = readSymbolValues(padded, s * bps, cfg)
    const symOff = s * symSamples
    for (let g = 0; g < cfg.groups; g++) {
      const bin = cfg.baseBin + g * cfg.binsPerGroup + values[g]!
      addBinTone(out, symOff, symSamples, bin, cfg.fftSize, toneAmp)
    }
    applyRaisedCosineRamp(out.subarray(symOff, symOff + symSamples), cfg.ramp)
  }

  return out
}

/**
 * Demodulate PCM back to bytes. Analyzes the steady centre of each symbol with
 * Goertzel and picks the strongest bin per band. Returns the first `byteLength`
 * bytes if given, else all decoded symbols' bytes.
 */
export function demodulateMfsk(pcm: Float32Array, byteLength?: number, cfg: MfskConfig = DEFAULT_MFSK): Uint8Array {
  const bps = bytesPerSymbol(cfg)
  const symSamples = symbolSamples(cfg)
  const numSymbols = Math.floor(pcm.length / symSamples)

  const out = new Uint8Array(numSymbols * bps)

  for (let s = 0; s < numSymbols; s++) {
    const winOff = s * symSamples + cfg.ramp
    const values: number[] = []
    for (let g = 0; g < cfg.groups; g++) {
      let bestV = 0
      let bestP = -1
      for (let v = 0; v < cfg.binsPerGroup; v++) {
        const bin = cfg.baseBin + g * cfg.binsPerGroup + v
        const p = goertzelPower(pcm, bin, cfg.fftSize, winOff)
        if (p > bestP) {
          bestP = p
          bestV = v
        }
      }
      values.push(bestV)
    }
    writeSymbolValues(values, out, s * bps, cfg)
  }

  return byteLength === undefined ? out : out.subarray(0, byteLength)
}
