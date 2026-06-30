import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: {
    css: true,
  },
  ignores: [
    '.output',
    '.nuxt',
    'dist-electron',
    'electron/dist',
  ],
})
