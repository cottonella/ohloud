import type { AppRouter } from '../server/router'
import { createTRPCClient, httpBatchLink } from '@trpc/client'

// A tRPC client whose transport is Electron IPC (preload's `trpcFetch`)
// instead of real HTTP — so everything stays local, no server/port needed.
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://electron/trpc', // dummy; the fetch below handles transport
      fetch: async (input, init) => {
        const v = await (window as any).electron.trpcFetch(input, init)
        return new Response(v.body, {
          status: v.status,
          statusText: v.statusText,
          headers: v.headers,
        })
      },
    }),
  ],
})

export default trpc
