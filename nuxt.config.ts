// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-06-30',
  devtools: { enabled: true },

  // SPA mode: no Node server required at runtime, so the whole app runs
  // purely locally — in the browser, or inside Electron via a custom
  // protocol that serves the generated files in `.output/public`.
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@noble/ciphers/chacha.js',
        '@noble/ciphers/utils.js',
        '@noble/hashes/argon2.js',
        '@noble/hashes/hkdf.js',
        '@noble/hashes/sha2.js',
        'fflate',
      ],
    },
  },

  app: {
    head: {
      title: 'ohloud',
      meta: [
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
