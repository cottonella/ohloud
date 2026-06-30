import type { Context } from './context'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.context<Context>().create()

// Define your procedures here. They run in the Electron main process.
export const appRouter = t.router({
  getDate: t.procedure.query(() => ({
    date: new Date().toLocaleString(),
    timestamp: Date.now(),
  })),

  multiply: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .query(({ input }) => input.a * input.b),
})

// The renderer imports ONLY this type, giving end-to-end type safety.
export type AppRouter = typeof appRouter
