// Preload runs sandboxed: `require('node:process')` would throw here, so we use
// the `process` global that Electron provides in the preload context.
/* eslint-disable node/prefer-global/process */
import { contextBridge, ipcRenderer } from 'electron'

// Expose a minimal, explicit API to the renderer (context isolation on).
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Used by the tRPC client to tunnel requests over IPC.
  trpcFetch: (...args: any[]) => ipcRenderer.invoke('trpc-fetch', ...args),
})
