// The iOS 26 relaunch wedge, and the only honest way through it.
//
// After a home-screen web app is force-closed, the relaunched process's ENTIRE
// audio subsystem is dead — playback renders nothing and the microphone
// delivers silence (the indicator lights, but the graph reads zeros). No web
// API revives it: verified on-device against Web Audio, worklets, media
// elements, and live getUserMedia streams. What does revive it is the system
// re-establishing the session — the user backgrounds and reopens the app (a
// Home-Screen round trip, or lock/unlock) — followed by a fresh user tap.
//
// So both send and receive acquire their context through acquireLiveContext():
// it PROBES a fresh context for a genuinely ticking render clock; when wedged
// it reports via `onWedged` (the UI shows the recovery steps) and then waits in
// SILENCE, holding no context at all, re-probing ONLY inside the user's Continue
// tap. This is the crux: keeping — or repeatedly creating — an AudioContext
// across the recovery trip re-binds the dead session the instant iOS tries to
// re-establish it, deadlocking recovery for good (verified on-device: reopening
// from a screen that keeps a context alive never revives; from one that holds
// nothing, the very next getUserMedia negotiates a clean session). Every audio
// object — down to the UI-sound context — must be released the moment we detect
// the wedge, or the OS never lets go.

export interface UnwedgeOptions {
  /** Fires once if the audio session is wedged and recovery guidance should be shown. */
  onWedged?: () => void
  /**
   * Receives a retry function to wire to a Continue button: after the user's
   * Home-Screen round trip (or lock/unlock), iOS only lets audio start from a
   * fresh USER TAP — calling this inside that tap completes the recovery.
   */
  onRetryAvailable?: (retry: () => void) => void
  /** Abort the wait (user backed out); acquireLiveContext rejects with AbortError. */
  signal?: AbortSignal
}

/** True once `ctx.currentTime` demonstrably advances within `windowMs`. */
function ticks(ctx: AudioContext, windowMs: number): Promise<boolean> {
  ctx.resume().catch(() => {})
  const t0 = ctx.currentTime
  const began = performance.now()
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      if (ctx.currentTime > t0) {
        clearInterval(iv)
        resolve(true)
      }
      else if (performance.now() - began > windowMs) {
        clearInterval(iv)
        resolve(false)
      }
    }, 25)
  })
}

/**
 * Build a fresh context with an inaudible keep-alive source: it both nudges the
 * engine and holds the session while the caller works, and dies with the
 * context on close().
 */
function buildContext(): AudioContext {
  const ctx = new AudioContext()
  try {
    const src = ctx.createConstantSource()
    const mute = ctx.createGain()
    mute.gain.value = 0
    src.connect(mute)
    mute.connect(ctx.destination)
    src.start()
  }
  catch {
    // a context that can't build a source will fail the clock check
  }
  return ctx
}

/**
 * Judge a fresh context by the one honest signal: does the render clock tick
 * within `windowMs`? Resolves the live context, or null after closing the
 * frozen one.
 */
async function probeContext(windowMs: number): Promise<AudioContext | null> {
  const ctx = buildContext()
  if (await ticks(ctx, windowMs))
    return ctx
  // Fully release before we report "wedged": a half-open context left dangling
  // into the recovery trip is exactly what keeps iOS's dead session bound.
  try {
    await ctx.close()
  }
  catch {
    // already closing
  }
  return null
}

/**
 * iOS/iPadOS — the only platform with the relaunch audio wedge. Everywhere else
 * (desktop browsers, Android, and the Tauri/WebView2 desktop app) a
 * gesture-started context just runs, so the tick probe would only ever
 * false-positive — WebView2's first context in particular is slow enough to
 * start that it trips the window. Detection mirrors `usePwaInstall`.
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined')
    return false
  if (/iP(?:hone|ad|od)/i.test(navigator.userAgent))
    return true
  // iPadOS 13+ masquerades as macOS; disambiguate via touch support.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Wait — holding NO audio context whatsoever — until a Continue tap probes one
 * that provably renders, or the signal aborts. There is deliberately no timer
 * and no foreground auto-probe: the only honest thaw signal is a ticking clock,
 * which needs a live context, and a live context across the recovery trip is
 * precisely what deadlocks iOS (see the file header). So we re-probe strictly
 * inside the user's gesture, and between taps keep absolutely nothing alive.
 */
function waitForThaw(signal?: AbortSignal, onRetry?: (retry: () => void) => void): Promise<AudioContext | null> {
  return new Promise((resolve) => {
    let stopped = false
    let attempting = false
    let retryQueued = false
    const onAbort = (): void => {
      stopped = true
      resolve(null)
    }
    const attempt = async (): Promise<void> => {
      if (stopped)
        return
      if (attempting) {
        // A tap arrived mid-probe — never drop it; re-fire when this one ends,
        // still inside the tap's transient-activation window.
        retryQueued = true
        return
      }
      attempting = true
      const ctx = await probeContext(450)
      attempting = false
      if (stopped) {
        ctx?.close().catch(() => {})
        return
      }
      if (ctx) {
        stopped = true
        signal?.removeEventListener('abort', onAbort)
        resolve(ctx)
        return
      }
      // Failed: probeContext already fully closed its context, so we are back to
      // holding nothing. Sit silent until the next Continue tap.
      if (retryQueued) {
        retryQueued = false
        void attempt()
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    // A tap-driven probe is the only one iOS honors — and the only one safe to
    // run, since by tap time the user's Home-Screen trip has re-established the
    // session untouched by any context of ours.
    onRetry?.(() => void attempt())
  })
}

/**
 * Acquire an AudioContext that PROVABLY renders. Call from a user gesture.
 * On iOS, healthy launches resolve in well under a second while wedged ones
 * report via `onWedged` and resolve after the user's recovery. Off iOS there is
 * no relaunch wedge, so the probe is skipped and a live context is returned
 * directly — the iOS-only recovery banner must never appear on desktop (it did
 * in the Tauri webview, where the probe false-fired). Rejects with AbortError
 * when `signal` aborts.
 */
export async function acquireLiveContext(options: UnwedgeOptions = {}): Promise<AudioContext> {
  if (!isIOS()) {
    const ctx = buildContext()
    await ctx.resume().catch(() => {})
    return ctx
  }

  let ctx = await probeContext(600)
  if (!ctx) {
    options.onWedged?.()
    ctx = await waitForThaw(options.signal, options.onRetryAvailable)
    if (!ctx)
      throw new DOMException('Audio wait aborted', 'AbortError')
  }
  return ctx
}
