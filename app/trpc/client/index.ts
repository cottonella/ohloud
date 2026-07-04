import type { AppRouter } from '../server/router'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '../server/context'
import { appRouter } from '../server/router'

// The tRPC transport runs entirely inside the webview: the client's `fetch`
// hands each batched request straight to the router through tRPC's fetch
// adapter — no HTTP server, no port. Procedures that need the native side (e.g.
// `native`) reach into Rust via Tauri IPC from inside their resolver. This keeps
// the whole tRPC machinery — batching, zod validation, end-to-end types — while
// staying serverless, exactly like the app itself. The native IPC lives inside
// the resolvers that need it (see the `native` procedure), not in the transport.
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://ohloud.localhost/trpc', // dummy origin; the fetch below is the real transport
      fetch: (input, init) =>
        fetchRequestHandler({
          endpoint: '/trpc',
          req: new Request(input, init),
          router: appRouter,
          createContext,
        }),
    }),
  ],
})

export default trpc
