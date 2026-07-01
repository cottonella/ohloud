import { startPwaInstallCapture } from '~/composables/usePwaInstall'

// Start listening for `beforeinstallprompt` as early as possible, so the event
// is captured before the user ever opens the install dialog.
export default defineNuxtPlugin(() => {
  startPwaInstallCapture()
})
