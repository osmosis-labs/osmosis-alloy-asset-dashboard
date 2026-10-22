import { createContext } from "react"

// The per-request CSP nonce (workers/app.ts), for inline scripts React
// Router does not render itself (next-themes' theme script). Set during
// server rendering only; it is empty in the browser, which hides nonces from
// the DOM once the page has loaded.
export const NonceContext = createContext<string | undefined>(undefined)
