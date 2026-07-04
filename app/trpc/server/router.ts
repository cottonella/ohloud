import type { Context } from './context'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

// Option A runs the tRPC "server" (this router) inside the webview, which
// @trpc/server blocks by default — this flag is the intended opt-in for
// deliberately running it outside a server (browser, worker, etc.).
const t = initTRPC.context<Context>().create({
  allowOutsideOfServer: true,
})

// Shape of the native payload returned by the Rust `app_info` command.
export interface NativeInfo {
  name: string
  version: string
  tauriVersion: string
  os: string
  arch: string
}

// The procedures run in the webview (Option A): the client wires the tRPC fetch
// adapter to this router in-process (see ../client). `native` is the one that
// crosses the Tauri IPC boundary into Rust — everything else is pure and needs
// no native side, so the same router works on the website too.
export const appRouter = t.router({
  // Pure, in-webview — quick sanity checks that never touch the native side.
  getDate: t.procedure.query(() => ({
    date: new Date().toLocaleString(),
    timestamp: Date.now(),
  })),

  multiply: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .query(({ input }) => input.a * input.b),

  // Round-trips to the Rust backend over Tauri IPC when running in the desktop
  // app; on the website it reports `{ source: 'web' }`, so the same call is safe
  // everywhere. Poke it from the DevTools console: `await window.trpc.native.query()`.
  native: t.procedure.query(async () => {
    const { invoke, isTauri } = await import('@tauri-apps/api/core')
    if (!isTauri())
      return { source: 'web' as const }
    const info = await invoke<NativeInfo>('app_info')
    return { source: 'tauri' as const, ...info }
  }),
})

// The client imports ONLY this type, giving end-to-end type safety.
export type AppRouter = typeof appRouter
