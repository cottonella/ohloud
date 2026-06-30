import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Framework-agnostic core logic (crypto, container, future FEC/DSP).
    include: ['app/core/**/*.test.ts'],
    environment: 'node',
  },
})
