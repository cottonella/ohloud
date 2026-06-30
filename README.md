# ohloud

A **Nuxt 4** application that runs entirely locally — in a web browser or
packaged as an **Electron** desktop app. No backend server runs at runtime
(Nuxt is in SPA mode), and the production app ships as a single `asar` with
**zero runtime `node_modules`**.

## Stack

- [Nuxt 4](https://nuxt.com) `4.4.x` — SPA (`ssr: false`)
- [Electron](https://www.electronjs.org) `43.x` — main/preload written in **TypeScript**, bundled with Vite
- [tRPC](https://trpc.io) `11.x` + [zod](https://zod.dev) — end-to-end typed calls from the renderer to the main process, tunneled over Electron IPC
- [Tailwind CSS v4](https://tailwindcss.com) + [daisyUI](https://daisyui.com) — UI
- [electron-builder](https://www.electron.build) `26.x` — packaging (asar verified)
- [ESLint](https://eslint.org) (`@antfu/eslint-config`)

## Setup

```bash
npm install
```

## Develop

Run as a **website** (hot reload at http://localhost:3000):

```bash
npm run dev
```

Run as a **desktop app** (Nuxt dev server + Electron, all live-reload, incl.
auto-rebuild & restart of the main process):

```bash
npm run electron:dev
```

## Debug in VS Code

`.vscode/launch.json` provides three configs (they auto-start the dev server):

| Config | Debugs |
|---|---|
| **Electron: Main + Renderer** (compound) | the main process (`electron/main.ts`) **and** the Vue UI together |
| **Electron: Main** | just the main process |
| **Website (Chrome)** | the app as a plain website (no Electron) |

Open the Run & Debug panel, pick **Electron: Main + Renderer**, press F5. Set
breakpoints in `electron/*.ts` and in `app/**/*.vue`.

## Static site

The app can run as a plain static website (no Electron, no server):

```bash
npm run generate        # -> .output/public  (deploy to any static host)
```

Serve it locally to check it: `npx serve .output/public`.

## Build & package the desktop app

```bash
npm run build   # build only: static site (.output/public) + electron bundle (electron/dist)
npm run pack    # build + package into a runnable FOLDER (no installer) for testing
npm run dist    # build + package a distributable .zip (no installer)
```

**Testing the production build:** `npm run pack` writes an unpacked app to

```
dist-electron/win-unpacked/
└── ohloud.exe        <- double-click to run the real production build
```

`npm run dist` instead produces `dist-electron/ohloud-<version>-win.zip` (the
same folder, zipped) — there is **no installer**; targets are set to `zip`
(Windows/macOS) and `AppImage` (Linux) in `package.json` → `build`. Switch any
of them to `nsis`/`dmg` if you ever want an installer.

## Lint

```bash
npm run lint            # eslint . (add --fix to auto-fix)
```

## npm scripts

Eight scripts, each with a distinct job:

| Script | Purpose |
|---|---|
| `dev` | Run as a website (hot reload) |
| `electron:dev` | Run as a desktop app (hot reload + main-process restart) |
| `generate` | Build the static website (`.output/public`) |
| `build` | Production build of site + electron bundle (prereq for packaging) |
| `pack` | Package into a runnable folder for testing (`win-unpacked/`) |
| `dist` | Package a distributable `.zip` (no installer) |
| `lint` | ESLint |
| `postinstall` | `nuxt prepare` (auto-runs; generates types) |

## How it works

- **SPA**: `nuxt generate` with `ssr: false` emits a static site to
  `.output/public`. Nothing needs a Node server at runtime.
- **Electron main/preload** are TypeScript, compiled by `electron/vite.config.ts`
  to `electron/dist/*.cjs`. `ssr.noExternal: true` bundles tRPC/zod into the
  output, so the packaged app needs no runtime dependencies.
- **Dev vs prod** is decided at build time via Vite's `import.meta.env.MODE`:
  the dev electron build loads `http://localhost:3000`; the prod build serves
  the static files through a custom **`app://` protocol** (works inside `asar`,
  has SPA-route fallback, and is treated as a secure origin).
- **tRPC over IPC**: the renderer's tRPC client (`electron/trpc/client`) uses a
  custom `fetch` that forwards to `window.electron.trpcFetch` (exposed by
  `preload.ts`), which invokes the `appRouter` (`electron/trpc/server`) in the
  main process. The renderer imports only the router's **type** for full
  type-safety. tRPC therefore works only in the desktop app, not in the browser.
- **Security**: context isolation on, node integration off, a minimal
  `window.electron` bridge, path-traversal guard, and external links open in the
  system browser.
- **Lean asar**: electron-builder includes only production dependencies plus the
  `files` globs (`electron/dist`, `.output/public`). Because deps are bundled
  into `main.cjs`, the asar ships **zero `node_modules`** (~0.3 MB).

## Project structure

```
app/
  app.vue              # root component
  assets/css/main.css  # tailwind + daisyui
  pages/index.vue      # home page (runtime badge + tRPC demo)
  utils/trpc.ts        # re-exports the tRPC client
electron/
  main.ts              # main process (app:// protocol, IPC, tRPC bridge)
  preload.ts           # secure window.electron bridge
  vite.config.ts       # builds main/preload -> electron/dist/*.cjs
  trpc/
    server/router.ts   # tRPC procedures (run in main process)
    server/context.ts
    client/index.ts    # tRPC client (transport = IPC)
public/                # favicon.ico, robots.txt
build/icon.png         # app icon (electron-builder auto-converts to .ico/.icns)
.vscode/               # launch.json + tasks.json (debugging)
nuxt.config.ts         # Nuxt config (SPA + tailwind plugin)
package.json           # scripts + electron-builder ("build" field)
```
