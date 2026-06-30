// Fast OFDM modem (FORMAT.md B.6). Dozens of QAM-modulated subcarriers carried
// in parallel, with regularly-spaced pilots for per-subcarrier channel
// equalization and a cyclic prefix that absorbs multipath up to its length.
// OFDM is defined at one canonical rate (`OFDM_RATE` = 48 kHz): subcarriers sit
// on exact FFT bins, which only holds if modulation and demodulation share a
// sample grid. The framing layer resamples the payload between the device rate
// and 48 kHz (see protocol/frame.ts), so Fast mode is cross-rate-safe even though
// the FFT is grid-locked — a 48 kHz sender and a 44.1 kHz receiver interoperate.
//
// Higher throughput than Robust MFSK at the cost of needing a cleaner channel;
// FEC + pilots handle band-limiting and frequency-selective fading.

import { fft, ifft } from './fft'

/** The canonical rate OFDM is defined at; framing resamples to/from device rate. */
export const OFDM_RATE = 48000

export type Constellation = 'qpsk' | 'qam16' | 'qam64'

export interface OfdmConfig {
  sampleRate: number
  fftSize: number
  cpSize: number
  /** First/last data+pilot subcarrier bins (1500–6500 Hz @ 48 kHz). */
  binLow: number
  binHigh: number
  /** A pilot every `pilotSpacing` subcarriers. */
  pilotSpacing: number
  constellation: Constellation
  amplitude: number
}

export function ofdmConfig(constellation: Constellation): OfdmConfig {
  const fftSize = 1024
  // Subcarriers span 1500–6500 Hz — the band consumer speakers/mics actually
  // reproduce (the same range Robust MFSK uses). Going higher looks faster on
  // paper but real devices roll off by ~6–8 kHz, and an attenuated subcarrier
  // divided by its near-zero channel estimate becomes a noise amplifier.
  return {
    sampleRate: OFDM_RATE,
    fftSize,
    cpSize: 256,
    binLow: Math.round((1500 * fftSize) / OFDM_RATE), // 32
    binHigh: Math.round((6500 * fftSize) / OFDM_RATE), // 139
    pilotSpacing: 8, // dense enough to equalize delay spread up to ~N/16 samples
    constellation,
    amplitude: 0.7,
  }
}

export function bitsPerSubcarrier(c: Constellation): number {
  return c === 'qpsk' ? 2 : c === 'qam16' ? 4 : 6
}

function layout(cfg: OfdmConfig): { data: number[], pilots: number[] } {
  const data: number[] = []
  const pilots: number[] = []
  for (let b = cfg.binLow; b <= cfg.binHigh; b++) {
    if ((b - cfg.binLow) % cfg.pilotSpacing === 0)
      pilots.push(b)
    else
      data.push(b)
  }
  return { data, pilots }
}

export function symbolSamples(cfg: OfdmConfig): number {
  return cfg.fftSize + cfg.cpSize
}

export function bytesPerOfdmSymbol(cfg: OfdmConfig): number {
  return (layout(cfg).data.length * bitsPerSubcarrier(cfg.constellation)) / 8
}

export function ofdmSymbolCount(byteLen: number, cfg: OfdmConfig): number {
  const bitsPerSym = layout(cfg).data.length * bitsPerSubcarrier(cfg.constellation)
  return Math.max(1, Math.ceil((byteLen * 8) / bitsPerSym))
}

/** PCM samples a `byteLen`-byte payload occupies in OFDM at this config. */
export function ofdmPayloadSamples(byteLen: number, cfg: OfdmConfig): number {
  return ofdmSymbolCount(byteLen, cfg) * symbolSamples(cfg)
}

// ── Gray-coded PAM (one QAM dimension) ──────────────────────────────────────
function binaryToGray(b: number): number {
  return b ^ (b >> 1)
}

function grayToBinary(g: number): number {
  let b = g
  let s = g >> 1
  while (s) {
    b ^= s
    s >>= 1
  }
  return b
}

function pamNorm(m: number): number {
  const L = 1 << m
  return Math.sqrt((2 * (L * L - 1)) / 3) // normalize avg QAM symbol power to 1
}

function pamMap(bits: number, m: number): number {
  const L = 1 << m
  return 2 * grayToBinary(bits) - (L - 1)
}

function pamDemap(level: number, m: number): number {
  const L = 1 << m
  const i = Math.max(0, Math.min(L - 1, Math.round((level + (L - 1)) / 2)))
  return binaryToGray(i)
}

// ── Bit packing ─────────────────────────────────────────────────────────────
class BitReader {
  private pos = 0
  constructor(private readonly bytes: Uint8Array) {}
  read(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byteIdx = this.pos >> 3
      const bit = byteIdx < this.bytes.length ? (this.bytes[byteIdx]! >> (7 - (this.pos & 7))) & 1 : 0
      v = (v << 1) | bit
      this.pos++
    }
    return v
  }
}

class BitWriter {
  private readonly bits: number[] = []
  write(v: number, n: number): void {
    for (let i = n - 1; i >= 0; i--)
      this.bits.push((v >> i) & 1)
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8))
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i])
        out[i >> 3]! |= 1 << (7 - (i & 7))
    }
    return out
  }
}

/** Modulate bytes into OFDM PCM (length = whole number of OFDM symbols). */
export function modulateOfdm(data: Uint8Array, cfg: OfdmConfig): Float32Array {
  const { data: dataBins, pilots } = layout(cfg)
  const m = bitsPerSubcarrier(cfg.constellation) / 2
  const norm = pamNorm(m)
  const bitsPerSym = dataBins.length * bitsPerSubcarrier(cfg.constellation)
  const numSyms = Math.max(1, Math.ceil((data.length * 8) / bitsPerSym))
  const reader = new BitReader(data)
  const symLen = symbolSamples(cfg)
  const out = new Float32Array(numSyms * symLen)
  const N = cfg.fftSize

  for (let s = 0; s < numSyms; s++) {
    const re = new Float64Array(N)
    const im = new Float64Array(N)

    for (const p of pilots) {
      re[p] = 1
      re[N - p] = 1 // conjugate of a real value
    }
    for (const d of dataBins) {
      const iVal = pamMap(reader.read(m), m) / norm
      const qVal = pamMap(reader.read(m), m) / norm
      re[d] = iVal
      im[d] = qVal
      re[N - d] = iVal
      im[N - d] = -qVal // Hermitian symmetry → real time-domain output
    }

    ifft(re, im) // re now holds the real time-domain samples
    const off = s * symLen
    for (let i = 0; i < cfg.cpSize; i++)
      out[off + i] = re[N - cfg.cpSize + i]!
    for (let i = 0; i < N; i++)
      out[off + cfg.cpSize + i] = re[i]!
  }

  // Scale to a fixed peak so clean playback doesn't clip.
  let peak = 0
  for (let i = 0; i < out.length; i++)
    peak = Math.max(peak, Math.abs(out[i]!))
  if (peak > 0) {
    const scale = cfg.amplitude / peak
    for (let i = 0; i < out.length; i++)
      out[i] = out[i]! * scale
  }
  return out
}

interface Interp { d: number, p1: number, p2: number, w: number }

function interpTable(dataBins: number[], pilots: number[]): Interp[] {
  return dataBins.map((d) => {
    let p1 = pilots[0]!
    let p2 = pilots[pilots.length - 1]!
    for (const p of pilots) {
      if (p <= d)
        p1 = p
      if (p >= d) {
        p2 = p
        break
      }
    }
    return { d, p1, p2, w: p2 === p1 ? 0 : (d - p1) / (p2 - p1) }
  })
}

/** Demodulate OFDM PCM back to bytes, equalizing per-subcarrier from pilots. */
export function demodulateOfdm(pcm: Float32Array, byteLength: number | undefined, cfg: OfdmConfig): Uint8Array {
  const { data: dataBins, pilots } = layout(cfg)
  const m = bitsPerSubcarrier(cfg.constellation) / 2
  const norm = pamNorm(m)
  const symLen = symbolSamples(cfg)
  const N = cfg.fftSize
  const bitsPerSym = dataBins.length * bitsPerSubcarrier(cfg.constellation)
  const numSyms = byteLength === undefined
    ? Math.floor(pcm.length / symLen)
    : Math.max(1, Math.ceil((byteLength * 8) / bitsPerSym))

  // Cyclic-prefix timing sync: the CP is a copy of each symbol's tail, so the
  // start lag that best correlates CP↔tail (summed over symbols) is the true
  // symbol boundary. The caller hands us a region with lead margin so this can
  // search; it locks the FFT window to the symbols despite channel group delay
  // and chirp-sync slack — the one thing coherent OFDM cannot otherwise tolerate.
  const slack = Math.max(0, pcm.length - numSyms * symLen)
  let lag = 0
  if (slack > 0) {
    const maxLag = Math.min(slack, 2 * cfg.cpSize)
    let best = -Infinity
    for (let L = 0; L <= maxLag; L++) {
      let cr = 0
      let ea = 0
      let eb = 0
      for (let s = 0; s < numSyms; s++) {
        const p = L + s * symLen
        for (let i = 0; i < cfg.cpSize; i++) {
          const a = pcm[p + i] ?? 0
          const b = pcm[p + N + i] ?? 0
          cr += a * b
          ea += a * a
          eb += b * b
        }
      }
      const score = cr / Math.sqrt(ea * eb + 1e-12)
      if (score > best) {
        best = score
        lag = L
      }
    }
  }

  const table = interpTable(dataBins, pilots)
  const writer = new BitWriter()

  const hr = new Float64Array(N)
  const hi = new Float64Array(N)

  // Read the FFT window from the MIDDLE of the cyclic prefix, not its end, so a
  // few samples of late timing error (channel group delay, chirp-detection
  // granularity, resampling) don't push the window into the next symbol → ISI.
  // Reading `shift` samples early circularly rotates each subcarrier by a known
  // linear phase; we de-rotate it below (it wraps faster than the pilot spacing,
  // so leaving it in would wreck the channel interpolation).
  const fftStart = cfg.cpSize >> 1
  const shift = cfg.cpSize - fftStart
  const derotC = new Float64Array(N)
  const derotS = new Float64Array(N)
  for (let b = cfg.binLow; b <= cfg.binHigh; b++) {
    const ph = (2 * Math.PI * b * shift) / N
    derotC[b] = Math.cos(ph)
    derotS[b] = Math.sin(ph)
  }

  for (let s = 0; s < numSyms; s++) {
    const off = lag + s * symLen + fftStart
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    for (let i = 0; i < N; i++)
      re[i] = pcm[off + i] ?? 0
    fft(re, im)

    // Undo the deterministic CP-backoff phase ramp, leaving only the channel.
    for (let b = cfg.binLow; b <= cfg.binHigh; b++) {
      const nr = re[b]! * derotC[b]! - im[b]! * derotS[b]!
      const ni = re[b]! * derotS[b]! + im[b]! * derotC[b]!
      re[b] = nr
      im[b] = ni
    }

    // Estimate the residual symbol-timing offset from the pilot phase slope — a
    // timing error is a linear phase ramp across frequency, and pilots carry a
    // known value (1), so the average phase step between adjacent pilots IS that
    // ramp. Nulling it makes the demod tolerant of the real timing error left by
    // channel group delay and chirp-sync granularity (without this, OFDM decodes
    // only with sample-perfect timing — fine in tests, hopeless over the air).
    let aR = 0
    let aI = 0
    for (let i = 0; i + 1 < pilots.length; i++) {
      const p = pilots[i]!
      const q = pilots[i + 1]!
      aR += re[p]! * re[q]! + im[p]! * im[q]!
      aI += re[p]! * im[q]! - im[p]! * re[q]!
    }
    const perBin = Math.atan2(aI, aR) / cfg.pilotSpacing
    for (let b = cfg.binLow; b <= cfg.binHigh; b++) {
      const ph = -perBin * b
      const c = Math.cos(ph)
      const sn = Math.sin(ph)
      const nr = re[b]! * c - im[b]! * sn
      const ni = re[b]! * sn + im[b]! * c
      re[b] = nr
      im[b] = ni
    }

    // Channel estimate at pilots (pilot value is 1 → H = received).
    for (const p of pilots) {
      hr[p] = re[p]!
      hi[p] = im[p]!
    }

    for (const { d, p1, p2, w } of table) {
      const Hr = hr[p1]! + (hr[p2]! - hr[p1]!) * w
      const Hi = hi[p1]! + (hi[p2]! - hi[p1]!) * w
      const denom = Hr * Hr + Hi * Hi || 1e-12
      // Y = received[d] / H  (complex division)
      const yr = (re[d]! * Hr + im[d]! * Hi) / denom
      const yi = (im[d]! * Hr - re[d]! * Hi) / denom
      writer.write(pamDemap(yr * norm, m), m)
      writer.write(pamDemap(yi * norm, m), m)
    }
  }

  const bytes = writer.toBytes()
  return byteLength === undefined ? bytes : bytes.subarray(0, byteLength)
}
