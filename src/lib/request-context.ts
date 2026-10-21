import { AsyncLocalStorage } from "node:async_hooks"

// The Prisma client is request-scoped on Workers (see database.ts). The store
// is entered from the Worker fetch handler and read wherever a client is
// opened. Scripts and local tools never enter it, so they share one client.
// `nonce` is the request's CSP script nonce, read by app/entry.server.tsx.
export type RequestBindings = { ctx: object; nonce?: string }

export const requestStore = new AsyncLocalStorage<RequestBindings>()
