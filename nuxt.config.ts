// https://nuxt.com/docs/api/configuration/nuxt-config
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'

// Locked-down CSP for the BUILT app (the website and the Tauri desktop app both
// serve this same HTML). Omitted in dev so Vite's HMR (which needs 'unsafe-eval'
// + a ws: connection) keeps working. `'unsafe-inline'` on script is required by
// Nuxt's tiny inline bootstrap — it carries a per-build buildId, so a static
// hash can't be pinned; the app itself uses no eval, loads only same-origin
// assets, and runs its audio worklet + codec worker from blob:. `connect-src`
// also allows Tauri's `ipc:`/`http://ipc.localhost` so the desktop build's
// `invoke()` bridge works (those sources are inert/unused on the web). This
// still blocks remote script/style/img/connect (exfiltration + remote payloads)
// and object/base-tag hijacking. Tauri injects no CSP of its own here
// (`app.security.csp` is null), so this policy is the single source of truth.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline' blob:`,
  `worker-src 'self' blob:`,
  `connect-src 'self' ipc: http://ipc.localhost`,
  `manifest-src 'self'`,
].join('; ')

const isProd = process.env.NODE_ENV === 'production'

export default defineNuxtConfig({
  compatibilityDate: '2025-06-30',
  devtools: { enabled: true },

  // SPA mode: no Node server required at runtime, so the whole app runs
  // purely locally — in the browser, or inside the Tauri desktop app, which
  // serves the generated `.output/public` files from the app's own origin.
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  // Kanchenjunga (body) + Pattaya (main heading), self-hosted, latin subset only —
  // bundled + precached, no Google CDN, so the offline PWA and 'self'-only CSP hold.
  // Latin weights only: Kanchenjunga also carries a Kirat Rai subset we don't need.
  css: [
    '@fontsource/kanchenjunga/latin-400.css',
    '@fontsource/kanchenjunga/latin-500.css',
    '@fontsource/kanchenjunga/latin-600.css',
    '@fontsource/kanchenjunga/latin-700.css',
    '@fontsource/pattaya/latin-400.css',
    '~/assets/css/main.css',
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@noble/ciphers/chacha.js',
        '@noble/ciphers/utils.js',
        '@noble/hashes/argon2.js',
        '@noble/hashes/hkdf.js',
        '@noble/hashes/sha2.js',
        '@tauri-apps/api/core',
        '@tauri-apps/plugin-opener',
        '@trpc/client',
        '@trpc/server',
        '@trpc/server/adapters/fetch',
        'canvas-confetti',
        'fflate',
        'zod',
      ],
    },
  },

  app: {
    head: {
      title: 'ohloud',
      meta: [
        // Production-only: keep Vite HMR unshackled in dev (see the const above).
        ...(isProd ? [{ 'http-equiv': 'Content-Security-Policy', 'content': CONTENT_SECURITY_POLICY }] : []),
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        // Installable-PWA hints — iOS needs the apple-* variants explicitly.
        { name: 'theme-color', content: '#f7eddc' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'ohloud' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // Link the manifest into the static shell ourselves — in Nuxt 4 SPA mode
        // the module generates it but doesn't inject the <link> reliably.
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  // Offline-first PWA: a Workbox service worker precaches every built asset, so
  // once installed the app runs with no network (it never needed one). Installable
  // on iOS via Safari → Share → "Add to Home Screen".
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ohloud',
      short_name: 'ohloud',
      description: 'Send secrets by sound — offline, encrypted, no server, no pairing.',
      lang: 'en',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      theme_color: '#f7eddc',
      background_color: '#f7eddc',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Explicit globs — precache everything the offline app needs, and sidestep the
      // Nuxt-4 `**/_payload.json` "no match" warning from the SSR-oriented defaults.
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'],
      navigateFallback: '/',
      maximumFileSizeToCacheInBytes: 5_000_000,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
    },
  },
})
