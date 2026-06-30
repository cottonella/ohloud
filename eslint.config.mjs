import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: {
      css: true,
    },
    ignores: [
      '.output',
      '.nuxt',
      'dist-electron',
      'electron/dist',
    ],
  },
  {
    // The design docs use multiple H1s on purpose (e.g. FORMAT.md Part A / Part B).
    files: ['**/*.md'],
    rules: {
      'markdown/no-multiple-h1': 'off',
    },
  },
)
