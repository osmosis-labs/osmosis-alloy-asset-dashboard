import { createRequestHandler } from "react-router"

import { requestStore } from "../src/lib/request-context"
import yogaWasm from "../.generated/yoga.wasm?module"

// Published before the server build is imported. yoga reads this from its
// instantiateWasm hook (workers/wasm-module-plugin.ts). A static import of
// the server build would run that module first and miss it.
globalThis.__workerWasm = { yoga: yogaWasm }

type DataCacheKv = {
  get(key: string, type: "text"): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>
}

type Env = {
  DATA_CACHE?: DataCacheKv
  SITE_ENV?: string
} & Record<string, unknown>

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
)

// Sent with every response. The swap page connects wallets and signs
// transactions, so no other site may frame it.
const SECURITY_HEADERS: [string, string][] = [
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  ],
]

const applySecurityHeaders = (response: Response) => {
  const headers = new Headers(response.headers)
  for (const [key, value] of SECURITY_HEADERS) headers.set(key, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: object) {
    // String bindings (vars and secrets) are what the services read. KV is
    // an object; the cache reads it from the global set below.
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") process.env[key] = value
    }
    globalThis.__DATA_CACHE__ = env.DATA_CACHE
    // Bindings are already on process.env and the request store. React Router
    // 8 takes a RouterContextProvider here, and no loader reads one.
    const response = await requestStore.run({ ctx }, () =>
      requestHandler(request)
    )
    return applySecurityHeaders(response)
  },
}
