// The Workbox service worker is only wanted on the website, where it makes the
// PWA work offline. Inside the Tauri desktop app the frontend is already local
// and shipped with the app binary, so a precaching SW earns nothing, and it
// actively hurts: on launch it serves the previous build until a manual refresh,
// so a new version pill or font shows up one load late.
//
// The module's own auto-registration is turned off (client.registerPlugin is
// false in nuxt.config); registration happens here instead, on the web only.
export default defineNuxtPlugin(async () => {
  if (!('serviceWorker' in navigator))
    return

  // Lazy import so @tauri-apps/api/core stays out of the eager web bundle, like
  // the rest of the app's Tauri usage.
  const { isTauri } = await import('@tauri-apps/api/core')

  if (isTauri()) {
    // Desktop app: make sure no SW (from this or an older build) is left
    // controlling the webview, and drop its caches so nothing serves a stale
    // build on the next launch.
    const registrations = await navigator.serviceWorker.getRegistrations()
    const hadController = Boolean(navigator.serviceWorker.controller)
    await Promise.all(registrations.map(reg => reg.unregister()))
    if (window.caches) {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    }
    // A leftover SW from before this change already served this stale load;
    // reload once to pick up the freshly-bundled build. With no SW registered
    // now, the reloaded page has no controller, so this runs at most once.
    if (hadController)
      window.location.reload()
    return
  }

  // Website: register the generated Workbox SW (only in the built app, there is
  // no SW in dev). skipWaiting + clientsClaim let a fresh build take over on the
  // next load. A failed registration just means no offline caching.
  if (import.meta.dev)
    return
  await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
})
