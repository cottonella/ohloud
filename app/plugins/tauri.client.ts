import trpc from '~/utils/trpc'

// Client-only plugin with two jobs:
//  1. Expose the tRPC client on `window.trpc` so the IPC bridge can be poked
//     from the DevTools console. In the desktop app
//     `await window.trpc.native.query()` round-trips into Rust and returns
//     `{ source: 'tauri', ... }`; on the website it returns `{ source: 'web' }`.
//  2. In the Tauri desktop app only, hand external links (http/https/mailto) to
//     the system browser via the opener plugin — a Tauri webview does not send
//     target="_blank" to the OS browser on its own, it would try to navigate
//     in-window (which the app otherwise has no way back from).
export default defineNuxtPlugin(async () => {
  const w = window as typeof window & { trpc?: typeof trpc }
  w.trpc = trpc

  const { isTauri } = await import('@tauri-apps/api/core')
  if (!isTauri())
    return

  const { openUrl } = await import('@tauri-apps/plugin-opener')
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest('a[href]')
    const href = anchor?.getAttribute('href')
    if (href && /^(?:https?|mailto):/i.test(href)) {
      event.preventDefault()
      void openUrl(href)
    }
  })
})
