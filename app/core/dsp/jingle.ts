// A short, decorative glockenspiel jingle synthesized as PCM to play just before
// the sync chirp — a cute "here comes a secret" cue. Purely cosmetic: the receiver
// locates the chirp by matched-filter correlation and simply scans past the jingle
// (steady tones correlate poorly with a sweep), so it never affects decoding.
//
// Original tune ("Tiptoe mischief") — a chromatic sneak E→F→F♯→G, then a hop home.

// [freqHz, secondsUntilNextNote]; freq 0 is a rest.
const MELODY: [number, number][] = [
  [1318.51, 0.12], // E6
  [1396.91, 0.12], // F6
  [1479.98, 0.12], // F#6
  [1567.98, 0.20], // G6
  [0, 0.08], // rest
  [1318.51, 0.12], // E6
  [1046.50, 0.40], // C6
]
// Percussive bell partials (fundamental + two bright overtones) and envelope.
const PARTIALS: [number, number][] = [[1, 0.6], [4, 0.24], [8, 0.08]]
const ATTACK_SEC = 0.006
const DECAY_SEC = 0.16
const RING_SEC = 0.4 // how long each note keeps sounding
const GAP_SEC = 0.12 // trailing silence so the jingle decays before the chirp

function melodySec(): number {
  let onset = 0
  for (let i = 0; i < MELODY.length - 1; i++)
    onset += MELODY[i]![1]
  return onset + RING_SEC
}

/** Total length of the jingle (including its tail + trailing gap) in seconds. */
export function jingleDurationSec(): number {
  return melodySec() + GAP_SEC
}

/** Length of the rendered jingle in samples at `sampleRate`. */
export function jingleSamples(sampleRate: number): number {
  return Math.round(jingleDurationSec() * sampleRate)
}

/** Render the jingle to mono PCM at `sampleRate`. */
export function synthXylophoneJingle(sampleRate: number, amp = 0.5): Float32Array {
  const out = new Float32Array(jingleSamples(sampleRate))
  const ringSamples = Math.round(RING_SEC * sampleRate)
  const nyquist = sampleRate * 0.45

  let onset = 0
  for (const [freq, step] of MELODY) {
    if (freq > 0) {
      const start = Math.round(onset * sampleRate)
      for (let i = 0; i < ringSamples && start + i < out.length; i++) {
        const t = i / sampleRate
        const env = (1 - Math.exp(-t / ATTACK_SEC)) * Math.exp(-t / DECAY_SEC)
        let s = 0
        for (const [ratio, a] of PARTIALS) {
          const pf = freq * ratio
          if (pf < nyquist)
            s += a * Math.sin(2 * Math.PI * pf * t)
        }
        out[start + i] = out[start + i]! + amp * env * s
      }
    }
    onset += step
  }

  // Guard against summed overlaps clipping past full scale.
  for (let i = 0; i < out.length; i++)
    out[i] = Math.max(-0.98, Math.min(0.98, out[i]!))

  return out
}
