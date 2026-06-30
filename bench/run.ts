// Loopback bench (TASKS.md §16). Runs the modem + FEC + framing through the
// simulated acoustic channel across realistic scenarios and prints raw modem
// BER, full-frame decode success, and net throughput. Run: `npm run bench`.

/* eslint-disable no-console -- CLI bench script, console output is the point */
import type { Constellation } from '../app/core/dsp/ofdm'
import type { ChannelOptions } from './channel'
import { DEFAULT_MFSK, demodulateMfsk, modulateMfsk } from '../app/core/dsp/mfsk'
import { bytesPerOfdmSymbol, demodulateOfdm, modulateOfdm, ofdmConfig } from '../app/core/dsp/ofdm'
import { simulateChannel } from './channel'
import { bytesEqual, modemDecodeFrame, modemEncodeFrame, randomBytes, SAMPLE_RATE } from './modem'

// Raw modem byte-error rate — how many bytes the demodulator gets wrong BEFORE
// any FEC (the physical-layer health of the channel).
function rawBer(channel: ChannelOptions, payloadBytes: number, seed: number): number {
  const data = randomBytes(payloadBytes, seed)
  const dirty = simulateChannel(modulateMfsk(data, DEFAULT_MFSK), { ...channel, sampleRate: SAMPLE_RATE, seed })
  const out = demodulateMfsk(dirty, data.length, DEFAULT_MFSK)
  let errs = 0
  for (let i = 0; i < data.length; i++) {
    if (out[i] !== data[i])
      errs++
  }
  return errs / data.length
}

interface Scenario { name: string, ch: ChannelOptions }

const SCENARIOS: Scenario[] = [
  { name: 'clean', ch: {} },
  { name: 'quiet room', ch: { snrDb: 30, reverb: 0.15, reverbDecaySec: 0.3, bandLow: 200, bandHigh: 15000 } },
  { name: 'normal room', ch: { snrDb: 20, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 } },
  { name: 'noisy room', ch: { snrDb: 12, reverb: 0.35, reverbDecaySec: 0.45, bandLow: 400, bandHigh: 10000 } },
  { name: 'harsh + clip', ch: { snrDb: 8, reverb: 0.4, reverbDecaySec: 0.5, bandLow: 500, bandHigh: 9000, clip: 0.6 } },
]

const TRIALS = 12
const PAYLOAD = 200

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function runScenario(s: Scenario): { ber: number, ok: number } {
  let berSum = 0
  let ok = 0
  for (let t = 0; t < TRIALS; t++) {
    const seed = 1000 + t * 7 + s.name.length
    berSum += rawBer(s.ch, PAYLOAD, seed)
    const blob = randomBytes(PAYLOAD, seed + 333)
    const pcm = simulateChannel(modemEncodeFrame(blob), { ...s.ch, sampleRate: SAMPLE_RATE, seed })
    if (bytesEqual(modemDecodeFrame(pcm) ?? new Uint8Array(0), blob))
      ok++
  }
  return { ber: berSum / TRIALS, ok }
}

function throughput(): number {
  const secs = modemEncodeFrame(randomBytes(PAYLOAD, 1)).length / SAMPLE_RATE
  return PAYLOAD / secs
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\nohloud loopback bench — Robust MFSK, ${TRIALS} trials × ${PAYLOAD} B payload\n`)
console.log('scenario        SNR   reverb  band(Hz)        raw BER   frame OK')
console.log('─'.repeat(70))
for (const s of SCENARIOS) {
  const { ber, ok } = runScenario(s)
  const snr = s.ch.snrDb === undefined ? '  ∞' : `${String(s.ch.snrDb).padStart(3)}`
  const rev = (s.ch.reverb ?? 0).toFixed(2)
  const band = s.ch.bandLow ? `${s.ch.bandLow}-${s.ch.bandHigh}` : 'full'
  console.log(`${s.name.padEnd(15)} ${snr}dB  ${rev}    ${band.padEnd(14)}  ${pct(ber).padStart(7)}   ${ok}/${TRIALS}`)
}

console.log('\nSNR sweep (find the cliff) @ reverb 0.25, band 300-12000:')
for (const snrDb of [6, 0, -6, -12, -18, -24, -30]) {
  const { ber, ok } = runScenario({ name: `snr${snrDb}`, ch: { snrDb, reverb: 0.25, reverbDecaySec: 0.4, bandLow: 300, bandHigh: 12000 } })
  console.log(`  ${String(snrDb).padStart(4)} dB   raw BER ${pct(ber).padStart(7)}   frame OK ${ok}/${TRIALS}`)
}

console.log('\nLowpass sweep (cutting into the 1875-6328 Hz MFSK band) @ SNR 15, reverb 0.2:')
for (const bandHigh of [12000, 8000, 6000, 5000, 4000, 3000]) {
  const { ber, ok } = runScenario({ name: `band${bandHigh}`, ch: { snrDb: 15, reverb: 0.2, bandLow: 300, bandHigh } })
  console.log(`  ${String(bandHigh).padStart(5)} Hz   raw BER ${pct(ber).padStart(7)}   frame OK ${ok}/${TRIALS}`)
}

console.log('\nReverb sweep @ SNR 15, band 300-12000:')
for (const reverb of [0.2, 0.4, 0.6, 0.8, 0.95]) {
  const { ber, ok } = runScenario({ name: `rev${reverb}`, ch: { snrDb: 15, reverb, reverbDecaySec: 0.5, bandLow: 300, bandHigh: 12000 } })
  console.log(`  ${reverb.toFixed(2)}   raw BER ${pct(ber).padStart(7)}   frame OK ${ok}/${TRIALS}`)
}

console.log(`\nNet throughput (Robust MFSK, after FEC + framing): ${throughput().toFixed(1)} B/s`)
console.log(`Symbol rate: ${(1 / (DEFAULT_MFSK.analysisSec + 2 * DEFAULT_MFSK.guardSec)).toFixed(1)} sym/s × 3 B = ${(3 / (DEFAULT_MFSK.analysisSec + 2 * DEFAULT_MFSK.guardSec)).toFixed(0)} B/s raw`)

// ── Fast OFDM (raw modem, noise + band-limit; short multipath is unit-tested) ─
function ofdmBer(c: Constellation, snrDb: number, payload: number): number {
  const cfg = ofdmConfig(c)
  let bits = 0
  const trials = 4
  for (let t = 0; t < trials; t++) {
    const d = randomBytes(payload, snrDb * 13 + t)
    const dirty = simulateChannel(modulateOfdm(d, cfg), { snrDb, bandLow: 300, bandHigh: 12000, seed: snrDb * 7 + t })
    const out = demodulateOfdm(dirty, d.length, cfg)
    for (let i = 0; i < d.length; i++) {
      let x = (out[i] ?? 0) ^ d[i]!
      while (x) {
        bits += x & 1
        x >>= 1
      }
    }
  }
  return bits / (payload * 8 * trials)
}

console.log('\nFast OFDM (raw modem) — throughput vs SNR per constellation:')
console.log('constellation   raw B/s    BER@30dB  BER@24dB  BER@18dB')
for (const c of ['qpsk', 'qam16', 'qam64'] as Constellation[]) {
  const cfg = ofdmConfig(c)
  const payload = Math.floor(bytesPerOfdmSymbol(cfg)) * 8
  const bps = payload / (modulateOfdm(randomBytes(payload, 1), cfg).length / SAMPLE_RATE)
  console.log(`${c.padEnd(14)} ${bps.toFixed(0).padStart(6)}   ${pct(ofdmBer(c, 30, payload)).padStart(8)}  ${pct(ofdmBer(c, 24, payload)).padStart(8)}  ${pct(ofdmBer(c, 18, payload)).padStart(8)}`)
}
console.log('')
