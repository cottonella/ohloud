import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'

// Per-request context. Add things like a db handle or user/session here.
export function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  return { req, resHeaders }
}

export type Context = Awaited<ReturnType<typeof createContext>>
