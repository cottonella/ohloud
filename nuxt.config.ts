// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-06-30',
  devtools: { enabled: true },

  // SPA mode: no Node server required at runtime, so the whole app runs
  // purely locally — in the browser, or inside Electron via a custom
  // protocol that serves the generated files in `.output/public`.
  ssr: false,

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
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },
})
