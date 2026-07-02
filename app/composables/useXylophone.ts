// A tiny synthesized glockenspiel for cute UI feedback (Web Audio, no samples).
// One shared AudioContext, unlocked on a user gesture.

// "Twinkle-up" success blip — E6, G6, C7. [freqHz, secondsUntilNextNote].
const BLIP: [number, number][] = [
  [1318.51, 0.12],
  [1567.98, 0.12],
  [2093.0, 0.3],
]
const PARTIALS: [number, number][] = [[1, 0.6], [4, 0.24], [8, 0.08]]

let ctx: AudioContext | null = null
let bus: AudioNode | null = null

export function useXylophone() {
  function ensure(): AudioContext | null {
    if (!import.meta.client)
      return null
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC)
        return null
      ctx = new AC()
      const comp = ctx.createDynamicsCompressor()
      const g = ctx.createGain()
      g.gain.value = 0.32
      comp.connect(g)
      g.connect(ctx.destination)
      bus = comp
    }
    if (ctx.state === 'suspended')
      void ctx.resume()
    return ctx
  }

  function ping(freq: number, at: number, dur: number): void {
    const c = ctx!
    const env = c.createGain()
    env.connect(bus!)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(0.9, at + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    for (const [ratio, a] of PARTIALS) {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * ratio
      const g = c.createGain()
      g.gain.value = a
      o.connect(g)
      g.connect(env)
      o.start(at)
      o.stop(at + dur + 0.03)
    }
  }

  function playSeq(seq: [number, number][]): void {
    const c = ensure()
    if (!c)
      return
    let at = c.currentTime + 0.02
    for (const [freq, step] of seq) {
      if (freq > 0)
        ping(freq, at, 0.6)
      at += step
    }
  }

  // Warm up the AudioContext during a user gesture (needed on iOS) so later,
  // gesture-less success sounds are allowed to play. Call this only AFTER the
  // real audio session is confirmed live — a UI-sound context created before
  // the wedge check sits alive across the recovery trip and deadlocks it.
  function unlock(): void {
    ensure()
  }

  // Drop the shared context entirely. Called the moment a wedge is detected:
  // any context alive across the recovery trip stops iOS re-establishing the
  // session. It lazily rebuilds on the next unlock()/success() once audio works.
  function release(): void {
    if (ctx) {
      void ctx.close()
      ctx = null
      bus = null
    }
  }

  return {
    unlock,
    release,
    /** Play the success blip (a message sent or received). */
    success: () => playSeq(BLIP),
  }
}
