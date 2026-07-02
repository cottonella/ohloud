import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron'
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

    // Normalize once (collapses any `..`) and require the result to stay under
    // publicDir *with* a trailing separator — so neither a crafted traversal nor
    // a sibling directory whose name merely starts with "public" can escape.
    const filePath = path.normalize(path.join(publicDir, rel))
    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep))
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

// The Receive tab needs the microphone. Electron denies media permission by
// default, so grant it here (deny everything else). The OS-level gate still
// applies — macOS reads `NSMicrophoneUsageDescription` from Info.plist
// (electron-builder `mac.extendInfo`) and shows its own consent prompt.
function registerMediaPermissions() {
  const isMedia = (permission: string): boolean => permission === 'media'
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isMedia(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => isMedia(permission))
}

// Only hand real web/mail links to the OS browser — never file://, custom
// schemes, or anything else a crafted in-page URL could smuggle to the shell.
function openExternalSafe(url: string): void {
  try {
    const scheme = new URL(url).protocol
    if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:')
      void shell.openExternal(url)
  }
  catch {
    // malformed URL — ignore
  }
}

// True only for the app's own origin (prod bundle, or the dev server).
function isAppOrigin(url: string): boolean {
  if (isDev)
    return url === DEV_SERVER_URL || url.startsWith(`${DEV_SERVER_URL}/`)
  return url.startsWith('app://bundle/')
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
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the user's browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  // Lock top-level navigation to the app's own origin. A stray or injected
  // `location = 'https://attacker…'` (or a redirect chain) must not carry this
  // window — with its preload bridge attached — off to a remote origin; send
  // such links to the external browser instead.
  const guardNavigation = (e: { preventDefault: () => void }, url: string): void => {
    if (isAppOrigin(url))
      return
    e.preventDefault()
    openExternalSafe(url)
  }
  win.webContents.on('will-navigate', guardNavigation)
  win.webContents.on('will-redirect', guardNavigation)

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
            // Wait for the Vue app to mount and render the ohloud shell.
            for (let i = 0; i < 120; i++) {
              if (/ohloud/i.test(document.body.innerText) && document.querySelector('.pill-tab'))
                break
              await wait(50)
            }
            return document.body.innerText
          })()`,
        )
        if (/ohloud/i.test(text) && /Receive/.test(text)) {
          // eslint-disable-next-line no-console
          console.log('SMOKE_TEST: OK (ohloud shell rendered from app://)')
          app.exit(0)
        }
        else {
          console.error('SMOKE_TEST: app shell not found. Body:', text.slice(0, 200))
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
  registerMediaPermissions()
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
