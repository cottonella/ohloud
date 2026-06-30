import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Builds the Electron main + preload (TypeScript) into electron/dist/*.cjs.
// `ssr.noExternal: true` bundles deps (tRPC, zod) into the output, so the
// packaged app ships zero runtime node_modules — only `electron` and Node
// built-ins stay external (provided by the Electron runtime).
export default defineConfig(({ mode }) => ({
  // Don't copy the Nuxt app's public/ (favicon, robots) into electron/dist.
  publicDir: false,
  build: {
    ssr: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: mode === 'production',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'main.ts'),
        preload: resolve(__dirname, 'preload.ts'),
      },
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name]-[hash].cjs',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  ssr: { noExternal: true },
}))
