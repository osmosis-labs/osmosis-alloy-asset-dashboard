// The wallet stack (cosmjs, cosmos-kit adapters) and the swap form's
// Buffer.from expect Node's global Buffer, which browsers lack and Vite does
// not polyfill. Imported first by the swap page, so it is set before any of
// those modules evaluate. The server has Node's own (nodejs_compat).
import { Buffer } from "buffer/"

// The npm package lacks a couple of newer Node statics, hence the cast.
globalThis.Buffer ??= Buffer as unknown as typeof globalThis.Buffer
