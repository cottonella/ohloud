import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Framework-agnostic core logic + the acoustic robustness bench.
    include: ['app/core/**/*.test.ts', 'bench/**/*.test.ts'],
    environment: 'node',
  },
})
