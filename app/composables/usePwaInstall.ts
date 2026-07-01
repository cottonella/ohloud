// PWA install helper. `beforeinstallprompt` fires once, early, on supporting
// browsers (Chrome/Edge/Android) — so we capture it at module level from a
// client plugin and expose it reactively to whoever needs it later.
//
// iOS Safari has no programmatic install, so `install()` is unavailable there
// and the UI falls back to "Add to Home Screen" instructions instead.

const deferredPrompt = shallowRef<any>(null)
const installedFlag = ref(false)
let started = false

/** Register the capture listeners once (call from a client plugin). */
export function startPwaInstallCapture() {
  if (!import.meta.client || started)
    return
  started = true
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Stop Chrome's mini-infobar; we drive the prompt from our own button.
    e.preventDefault()
    deferredPrompt.value = e
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
    installedFlag.value = true
  })
}

export function usePwaInstall() {
  const canPrompt = computed(() => !!deferredPrompt.value)

  const isStandalone = computed(() => {
    if (!import.meta.client)
      return false
    return window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
      || installedFlag.value
  })

  const isIOS = computed(() => {
    if (!import.meta.client)
      return false
    const ua = window.navigator.userAgent
    const iPhoneLike = /iphone|ipad|ipod/i.test(ua)
    // iPadOS 13+ masquerades as macOS; disambiguate via touch support.
    const iPadOS = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
    return iPhoneLike || iPadOS
  })

  /** Trigger the native install prompt. Returns the user's choice. */
  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const p = deferredPrompt.value
    if (!p)
      return 'unavailable'
    p.prompt()
    const res = await p.userChoice
    deferredPrompt.value = null
    return res?.outcome === 'accepted' ? 'accepted' : 'dismissed'
  }

  return { canPrompt, isStandalone, isIOS, install }
}
