import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { createContext } from './trpc/server/context'
import { appRouter } from './trpc/server/router'

// Vite replaces import.meta.env.MODE at build time:
// dev build (`--mode development`) => 'development', prod build => 'production'.
const isDev = (import.meta as any).env.MODE === 'development'
const DEV_SERVER_URL = 'http://localhost:3000'

// Static site (nuxt generate) lives at <root>/.output/public.
// Compiled main lives at <root>/electron/dist/main.cjs -> ../../.output/public
const publicDir = path.join(__dirname, '..', '..', '.output', 'public')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// Serve the static SPA over a custom secure protocol (works inside asar).
function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url)
    if (host !== 'bundle')
      return new Response('Bad host', { status: 400 })

    let rel = decodeURIComponent(pathname)
    // SPA fallback: root and extensionless client routes serve index.html.
    if (rel === '/' || !path.extname(rel))
      rel = '/index.html'

    const filePath = path.join(publicDir, rel.replace(/\.\.[/\\]/g, ''))
    if (!filePath.startsWith(publicDir))
      return new Response('Forbidden', { status: 403 })

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

// Bridge tRPC calls coming from the renderer (via preload) to the router.
function registerTrpc() {
  ipcMain.handle('trpc-fetch', async (_event, input, init) => {
    const req = new Request(input, {
      method: init?.method || 'GET',
      headers: init?.headers,
      body: init?.body,
    })

    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext,
      onError({ error }) {
        console.error('tRPC error:', error)
      },
    })

    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers),
      // Uint8Array survives Electron's structured-clone IPC.
      body: new Uint8Array(await res.arrayBuffer()),
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    // In dev the window/taskbar uses our icon; in a packaged build the
    // executable's embedded icon (set by electron-builder) is used instead.
    ...(isDev ? { icon: path.join(__dirname, '..', '..', 'build', 'icon.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the user's browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(DEV_SERVER_URL)
    win.webContents.openDevTools()
  }
  else {
    win.loadURL('app://bundle/')
  }

  // Optional CI/smoke-test hook: load the app, exercise tRPC over IPC, exit.
  if (process.env.ELECTRON_SMOKE_TEST) {
    win.webContents.on('did-finish-load', async () => {
      try {
        const text: string = await win.webContents.executeJavaScript(
          `(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms))
            let btn = null
            // Wait for the Vue app to mount and render the button.
            for (let i = 0; i < 100 && !(btn = document.querySelector('button.btn')); i++)
              await wait(50)
            if (!btn) return 'NO_BUTTON'
            btn.click()
            for (let i = 0; i < 60 && !document.body.innerText.includes('6 ×'); i++)
              await wait(50)
            return document.body.innerText
          })()`,
        )
        if (text.includes('42')) {
          // eslint-disable-next-line no-console
          console.log('SMOKE_TEST: OK (load + tRPC 6 × 7 = 42)')
          app.exit(0)
        }
        else {
          console.error('SMOKE_TEST: tRPC result missing. Body:', text)
          app.exit(1)
        }
      }
      catch (e) {
        console.error('SMOKE_TEST: error', e)
        app.exit(1)
      }
    })
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`SMOKE_TEST: did-fail-load ${code} ${desc} ${url}`)
      app.exit(1)
    })
  }
}

app.whenReady().then(() => {
  registerTrpc()
  if (!isDev)
    registerAppProtocol()
  createWindow()

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
