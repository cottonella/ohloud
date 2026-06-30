// Robust MFSK modem (FORMAT.md B.5), defined in PHYSICAL units (Hz + seconds)
// so it is sample-rate independent. Each symbol carries `groups` tones drawn
// from `groups` adjacent 16-tone bands; one tone per band encodes a nibble.
// Default geometry: 6 groups × 16 tones = 24 bits = 3 bytes per symbol, base
// tone 1875 Hz, 46.875 Hz spacing. Detection is per-band Goertzel argmax.
//
// Because the analysis window is a fixed *duration*, every protocol tone has an
// (almost) integer number of cycles within it at ANY sample rate, so tones stay
// orthogonal and a 48 kHz sender interoperates with a 44.1 kHz receiver.

import { goertzelPower } from './goertzel'
import { addTone } from './tone'
import { applyRaisedCosineRamp } from './window'

export interface MfskConfig {
  sampleRate: number
  /** Lowest tone (Hz). */
  f0: number
  /** Spacing between adjacent tones (Hz). */
  toneSpacing: number
  groups: number
  binsPerGroup: number
  /** Steady tone duration analyzed per symbol (seconds). */
  analysisSec: number
  /** Raised-cosine guard at each symbol edge (seconds). */
  guardSec: number
  amplitude: number
}

/** Rate-independent protocol geometry (the canonical definition). */
export const MFSK_PHYSICAL = {
  f0: 1875,
  toneSpacing: 46.875,
  groups: 6,
  binsPerGroup: 16,
  analysisSec: 1024 / 48000, // ≈ 21.33 ms → ~46.875 Hz resolution
  guardSec: 64 / 48000, // ≈ 1.33 ms
  amplitude: 0.8,
} as const

export function mfskConfig(sampleRate = 48000): MfskConfig {
  return { sampleRate, ...MFSK_PHYSICAL }
}

export const DEFAULT_MFSK: MfskConfig = mfskConfig(48000)

function bitsPerGroup(cfg: MfskConfig): number {
  return Math.log2(cfg.binsPerGroup)
}

export function bytesPerSymbol(cfg: MfskConfig): number {
  return (cfg.groups * bitsPerGroup(cfg)) / 8
}

export function analysisSamples(cfg: MfskConfig): number {
  return Math.round(cfg.analysisSec * cfg.sampleRate)
}

export function guardSamples(cfg: MfskConfig): number {
  return Math.round(cfg.guardSec * cfg.sampleRate)
}

export function symbolSamples(cfg: MfskConfig): number {
  return analysisSamples(cfg) + 2 * guardSamples(cfg)
}

export function symbolDurationSec(cfg: MfskConfig): number {
  return cfg.analysisSec + 2 * cfg.guardSec
}

// Absolute sample offset where symbol `s` begins — derived from physical time
// (not s × integer-length) so symbol timing never drifts across sample rates.
function symbolStart(cfg: MfskConfig, s: number): number {
  return Math.round(s * symbolDurationSec(cfg) * cfg.sampleRate)
}

/** PCM samples occupied by `numSymbols` MFSK symbols at this rate. */
export function framesToSamples(cfg: MfskConfig, numSymbols: number): number {
  return symbolStart(cfg, numSymbols)
}

function toneFreq(cfg: MfskConfig, group: number, value: number): number {
  return cfg.f0 + (group * cfg.binsPerGroup + value) * cfg.toneSpacing
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
  const guard = guardSamples(cfg)
  const numSymbols = Math.max(1, Math.ceil(data.length / bps))

  const padded = new Uint8Array(numSymbols * bps)
  padded.set(data)

  const out = new Float32Array(framesToSamples(cfg, numSymbols))
  const toneAmp = cfg.amplitude / cfg.groups

  for (let s = 0; s < numSymbols; s++) {
    const values = readSymbolValues(padded, s * bps, cfg)
    const start = symbolStart(cfg, s)
    const end = symbolStart(cfg, s + 1)
    for (let g = 0; g < cfg.groups; g++)
      addTone(out, start, end - start, toneFreq(cfg, g, values[g]!), cfg.sampleRate, toneAmp)
    applyRaisedCosineRamp(out.subarray(start, end), guard)
  }

  return out
}

/**
 * Demodulate PCM back to bytes. Analyzes the steady centre of each symbol with
 * Goertzel at each candidate tone and picks the strongest per band.
 */
export function demodulateMfsk(pcm: Float32Array, byteLength?: number, cfg: MfskConfig = DEFAULT_MFSK): Uint8Array {
  const bps = bytesPerSymbol(cfg)
  const guard = guardSamples(cfg)
  const n = analysisSamples(cfg)

  const decoded: number[] = []
  for (let s = 0; ; s++) {
    const winOff = symbolStart(cfg, s) + guard
    if (winOff + n > pcm.length)
      break
    for (let g = 0; g < cfg.groups; g++) {
      let bestV = 0
      let bestP = -1
      for (let v = 0; v < cfg.binsPerGroup; v++) {
        // Non-integer Goertzel bin: k = freq · N / sampleRate.
        const k = (toneFreq(cfg, g, v) * n) / cfg.sampleRate
        const p = goertzelPower(pcm, k, n, winOff)
        if (p > bestP) {
          bestP = p
          bestV = v
        }
      }
      decoded.push(bestV)
    }
  }

  const numSymbols = decoded.length / cfg.groups
  const out = new Uint8Array(numSymbols * bps)
  for (let s = 0; s < numSymbols; s++)
    writeSymbolValues(decoded.slice(s * cfg.groups, (s + 1) * cfg.groups), out, s * bps, cfg)

  return byteLength === undefined ? out : out.subarray(0, byteLength)
}
