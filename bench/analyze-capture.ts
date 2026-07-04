// Real-capture analyzer: turns a recording of an ohloud transmission into
// evidence about WHY it did or didn't decode. Run:
//
//   npx tsx bench/analyze-capture.ts path/to/recording.wav
//
// Record with anything (phone voice recorder → WAV, Audacity, `sox -d`), any
// sample rate, mono or stereo — hold the recorder where the receiving device
// would sit. The analyzer locates the chirp, reads the wire header, then
// walks the OFDM payload symbol by symbol and reports:
//
//   - gain track  — mean pilot magnitude per symbol. A ramp or pumping here
//                   is AGC / speaker-limiter action (the thing that kills
//                   amplitude-bearing constellations like 16-QAM).
//   - EVM / eff. SNR — post-equalization error vector magnitude per symbol,
//                   i.e. how clean the constellation actually is on-device.
//   - FEC survival — how many RS blocks decode after the real channel.
//
/* eslint-disable no-console -- CLI diagnostic, console output is the point */
import type { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fft } from '../app/core/dsp/fft'
import { bitsPerSubcarrier, OFDM_RATE, ofdmConfig } from '../app/core/dsp/ofdm'
import { resample } from '../app/core/dsp/resample'
import { fecDecode } from '../app/core/fec/blocks'
import { chirpSamples, headerSamples, locateChirp, ofdmGuardSamples, parseFrame } from '../app/core/protocol/frame'
import { FEC_RS_FOUNTAIN, modeBandHz, modeConstellation, modeIsOfdm } from '../app/core/protocol/wire-header'

// ── minimal WAV reader (PCM16 / PCM24 / PCM32 / float32, first channel) ─────
function readWav(path: string): { pcm: Float32Array, sampleRate: number } {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a RIFF/WAVE file')
  let off = 12
  let fmt: { format: number, channels: number, sampleRate: number, bits: number } | null = null
  let data: Buffer | null = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      }
    }
    else if (id === 'data') {
      data = buf.subarray(off + 8, off + 8 + size)
    }
    off += 8 + size + (size & 1)
  }
  if (!fmt || !data)
    throw new Error('missing fmt/data chunk')
  const { format, channels, bits } = fmt
  const bytesPer = bits / 8
  const frames = Math.floor(data.length / (bytesPer * channels))
  const pcm = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    const p = i * bytesPer * channels // channel 0
    if (format === 3 && bits === 32)
      pcm[i] = data.readFloatLE(p)
    else if (bits === 16)
      pcm[i] = data.readInt16LE(p) / 32768
    else if (bits === 24)
      pcm[i] = ((data[p]! | (data[p + 1]! << 8) | (data[p + 2]! << 16)) << 8 >> 8) / 8388608
    else if (bits === 32)
      pcm[i] = data.readInt32LE(p) / 2147483648
    else throw new Error(`unsupported WAV: format ${format}, ${bits} bit`)
  }
  return { pcm, sampleRate: fmt.sampleRate }
}

// ── OFDM per-symbol instrumentation (mirrors the demod's layout rules) ──────
function analyze(pcm48: Float32Array): void {
  const { offset, score } = locateChirp(pcm48, OFDM_RATE)
  console.log(`chirp: offset ${offset} (${(offset / OFDM_RATE).toFixed(2)} s in), correlation ${score.toFixed(3)} ${score < 0.2 ? '← WEAK (bad sync or wrong rate?)' : ''}`)

  let header
  try {
    header = parseFrame(pcm48, OFDM_RATE).header
  }
  catch (e) {
    console.log(`wire header: FAILED — ${(e as Error).message}`)
    console.log('verdict: the robust MFSK header itself did not decode; this is not a constellation problem (check level/distance/rate).')
    return
  }
  console.log(`wire header: mode 0x0${header.mode} · ${header.blockCount} blocks · RS${header.fecNsym} · fountain ${header.fec === FEC_RS_FOUNTAIN}`)
  if (!modeIsOfdm(header.mode)) {
    console.log('MFSK payload — per-symbol OFDM analysis not applicable.')
    return
  }

  const cfg = ofdmConfig(modeConstellation(header.mode), modeBandHz(header.mode))
  const payloadOff = offset + chirpSamples(OFDM_RATE) + headerSamples(OFDM_RATE) + ofdmGuardSamples(OFDM_RATE, header.mode)
  const symLen = cfg.fftSize + cfg.cpSize
  const payloadBytes = 255 * header.blockCount
  const bits = bitsPerSubcarrier(cfg.constellation)
  const pilots: number[] = []
  const dataBins: number[] = []
  for (let b = cfg.binLow; b <= cfg.binHigh; b++)
    ((b - cfg.binLow) % cfg.pilotSpacing === 0 ? pilots : dataBins).push(b)
  const numSyms = Math.max(1, Math.ceil((payloadBytes * 8) / (dataBins.length * bits)))

  console.log(`payload: ${numSyms} OFDM symbols · ${cfg.constellation} · band ${Math.round((cfg.binLow * OFDM_RATE) / cfg.fftSize)}–${Math.round((cfg.binHigh * OFDM_RATE) / cfg.fftSize)} Hz`)
  console.log('\nsym   gain(dB)   EVM%    eff.SNR(dB)')
  const gains: number[] = []
  for (let s = 0; s < numSyms; s++) {
    const start = payloadOff + s * symLen + cfg.cpSize
    if (start + cfg.fftSize > pcm48.length) {
      console.log(`  ${String(s).padStart(3)}  (recording ends mid-payload)`)
      break
    }
    const re = new Float64Array(cfg.fftSize)
    const im = new Float64Array(cfg.fftSize)
    for (let i = 0; i < cfg.fftSize; i++) re[i] = pcm48[start + i]!
    fft(re, im)
    // Channel estimate at pilots (transmitted value 1).
    let gSum = 0
    for (const p of pilots) gSum += Math.hypot(re[p]!, im[p]!)
    const gain = gSum / pilots.length
    gains.push(gain)
    // EVM: equalize each data bin by linear pilot interpolation, distance to
    // the nearest ideal constellation point, RMS over bins.
    let errP = 0
    let sigP = 0
    for (const d of dataBins) {
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
      const w = p2 === p1 ? 0 : (d - p1) / (p2 - p1)
      const h1 = { re: 0, im: 0 }
      const h2 = { re: 0, im: 0 }
      h1.re = re[p1]!
      h1.im = im[p1]!
      h2.re = re[p2]!
      h2.im = im[p2]!
      const hr = h1.re + (h2.re - h1.re) * w
      const hi = h1.im + (h2.im - h1.im) * w
      const hm = hr * hr + hi * hi
      if (hm < 1e-12)
        continue
      // Equalized symbol: Y / H.
      const yr = (re[d]! * hr + im[d]! * hi) / hm
      const yi = (im[d]! * hr - re[d]! * hi) / hm
      // Nearest ideal point per axis (Gray PAM levels normalized like the TX).
      const m = bits / 2
      const L = 1 << m
      const norm = Math.sqrt((2 * (L * L - 1)) / 3)
      const snap = (v: number) => {
        const lvl = Math.max(-(L - 1), Math.min(L - 1, 2 * Math.round((v * norm + (L - 1)) / 2) - (L - 1)))
        return lvl / norm
      }
      const ex = yr - snap(yr)
      const ey = yi - snap(yi)
      errP += ex * ex + ey * ey
      sigP += 1
    }
    const evm = Math.sqrt(errP / Math.max(1, sigP))
    const effSnr = -20 * Math.log10(Math.max(1e-6, evm))
    const bar = '█'.repeat(Math.max(0, Math.min(30, Math.round(effSnr))))
    console.log(`  ${String(s).padStart(3)}   ${(20 * Math.log10(gain / (gains[0]! || 1))).toFixed(1).padStart(6)}   ${(evm * 100).toFixed(1).padStart(5)}   ${effSnr.toFixed(1).padStart(6)}  ${bar}`)
  }

  const gMin = Math.min(...gains)
  const gMax = Math.max(...gains)
  const swingDb = 20 * Math.log10(gMax / Math.max(1e-9, gMin))
  console.log(`\ngain swing across payload: ${swingDb.toFixed(1)} dB ${swingDb > 3 ? '← AGC / limiter suspected (amplitude modes will fail)' : '(stable — amplitude chain looks clean)'}`)

  try {
    const parsed = parseFrame(pcm48, OFDM_RATE)
    try {
      fecDecode(parsed.fecData, { origLen: header.blobLen, blockCount: header.blockCount, nsym: header.fecNsym, fountain: header.fec === FEC_RS_FOUNTAIN })
      console.log('FEC: full payload recovered ✓ (a decode failure in the app would be container-level, not modem-level)')
    }
    catch {
      console.log('FEC: payload did NOT recover — the modem errors above exceed the FEC budget.')
    }
  }
  catch { /* header already reported */ }
}

const path = process.argv[2]
if (!path) {
  console.error('usage: npx tsx bench/analyze-capture.ts <recording.wav>')
  process.exit(1)
}
const { pcm, sampleRate } = readWav(path)
console.log(`${path}: ${(pcm.length / sampleRate).toFixed(1)} s @ ${sampleRate} Hz${sampleRate === OFDM_RATE ? '' : ` → resampling to ${OFDM_RATE}`}`)
analyze(sampleRate === OFDM_RATE ? pcm : resample(pcm, sampleRate, OFDM_RATE))
