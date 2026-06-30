// Acoustic channel simulator for the loopback bench (TASKS.md §16). Models the
// things that actually break data-over-sound in a real room: reverberation
// (multipath), speaker/mic band-limiting, clipping/AGC, and ambient noise.
// Pure-JS so it runs in Node — no OfflineAudioContext / hardware required.

export interface ChannelOptions {
  sampleRate?: number
  /** Additive white Gaussian noise SNR in dB (omit / Infinity = none). */
  snrDb?: number
  /** Reverb wet/dry mix 0..1 (0 = none). */
  reverb?: number
  /** Reverb RT60-ish decay in seconds. */
  reverbDecaySec?: number
  /** Highpass cutoff (Hz) — models speaker/mic low-end roll-off. */
  bandLow?: number
  /** Lowpass cutoff (Hz) — models high-end roll-off. */
  bandHigh?: number
  /** Hard-clip threshold (amplitude); omit = none. Models loud playback / AGC. */
  clip?: number
  /** Overall gain. */
  gain?: number
  /** Deterministic noise seed. */
  seed?: number
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Schroeder reverb: 4 parallel feedback combs + 2 series allpasses.
function reverb(pcm: Float32Array, sampleRate: number, decaySec: number, mix: number): Float32Array {
  const combDelays = [0.0297, 0.0371, 0.0411, 0.0437].map(d => Math.max(1, Math.floor(d * sampleRate)))
  const wet = new Float32Array(pcm.length)

  for (const d of combDelays) {
    const g = 10 ** ((-3 * d) / (decaySec * sampleRate))
    const buf = new Float32Array(d)
    let idx = 0
    for (let i = 0; i < pcm.length; i++) {
      const y = pcm[i]! + g * buf[idx]!
      buf[idx] = y
      wet[i] = wet[i]! + y
      idx = idx + 1 === d ? 0 : idx + 1
    }
  }
  for (let i = 0; i < wet.length; i++)
    wet[i] = wet[i]! / combDelays.length

  for (const [ds, g] of [[0.005, 0.7], [0.0017, 0.7]] as const) {
    const d = Math.max(1, Math.floor(ds * sampleRate))
    const buf = new Float32Array(d)
    let idx = 0
    for (let i = 0; i < wet.length; i++) {
      const bufv = buf[idx]!
      const y = -g * wet[i]! + bufv
      buf[idx] = wet[i]! + g * y
      wet[i] = y
      idx = idx + 1 === d ? 0 : idx + 1
    }
  }

  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++)
    out[i] = (1 - mix) * pcm[i]! + mix * wet[i]!
  return out
}

function lowpass(pcm: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const dt = 1 / sampleRate
  const rc = 1 / (2 * Math.PI * cutoff)
  const alpha = dt / (rc + dt)
  const out = new Float32Array(pcm.length)
  let y = 0
  for (let i = 0; i < pcm.length; i++) {
    y += alpha * (pcm[i]! - y)
    out[i] = y
  }
  return out
}

function highpass(pcm: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const dt = 1 / sampleRate
  const rc = 1 / (2 * Math.PI * cutoff)
  const alpha = rc / (rc + dt)
  const out = new Float32Array(pcm.length)
  let prevX = 0
  let prevY = 0
  for (let i = 0; i < pcm.length; i++) {
    const y = alpha * (prevY + pcm[i]! - prevX)
    out[i] = y
    prevX = pcm[i]!
    prevY = y
  }
  return out
}

function addNoise(pcm: Float32Array, snrDb: number, seed: number): Float32Array {
  let power = 0
  for (let i = 0; i < pcm.length; i++)
    power += pcm[i]! * pcm[i]!
  const sigRms = Math.sqrt(power / pcm.length)
  const noiseStd = sigRms / 10 ** (snrDb / 20)
  const rng = makeRng(seed)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++)
    out[i] = pcm[i]! + noiseStd * gaussian(rng)
  return out
}

/** Pass PCM through the simulated acoustic channel (reverb → band → clip → noise). */
export function simulateChannel(pcm: Float32Array, opts: ChannelOptions = {}): Float32Array {
  const sr = opts.sampleRate ?? 48000
  let x = pcm

  if (opts.reverb && opts.reverb > 0)
    x = reverb(x, sr, opts.reverbDecaySec ?? 0.3, opts.reverb)
  if (opts.bandLow)
    x = highpass(x, sr, opts.bandLow)
  if (opts.bandHigh)
    x = lowpass(x, sr, opts.bandHigh)
  if (opts.gain !== undefined && opts.gain !== 1) {
    const g = opts.gain
    const next = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++)
      next[i] = x[i]! * g
    x = next
  }
  if (opts.clip !== undefined) {
    const t = opts.clip
    const next = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++)
      next[i] = Math.max(-t, Math.min(t, x[i]!))
    x = next
  }
  if (opts.snrDb !== undefined && Number.isFinite(opts.snrDb))
    x = addNoise(x, opts.snrDb, opts.seed ?? 1)

  return x
}
