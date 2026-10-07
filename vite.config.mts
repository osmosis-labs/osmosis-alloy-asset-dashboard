import { existsSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { cloudflare } from "@cloudflare/vite-plugin"
import { reactRouter } from "@react-router/dev/vite"
import { defineConfig, type Plugin } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

import {
  workerWasmEsbuildPlugin,
  workerWasmPlugin,
} from "./workers/wasm-module-plugin"

const require = createRequire(import.meta.url)

// Keplr imports the npm `buffer` package as "buffer/" so it does not bind
// Node's builtin. The Worker dev prebundle otherwise leaves that as a dynamic
// require, which the workerd runner does not provide.
const bufferPolyfill = createRequire(
  require.resolve("@cosmos-kit/keplr/package.json")
).resolve("buffer/")

const bufferSlash: Plugin = {
  name: "buffer-slash",
  enforce: "pre",
  resolveId(source) {
    if (source === "buffer/") return bufferPolyfill
  },
}

// crypto and stream are Node builtins that the wallet stack (cosmjs) expects
// in the browser. Aliased only for the client environment so the Worker keeps
// Node's crypto (the cron route compares bearer tokens with timingSafeEqual).
// enforce: "pre" so this runs before Vite externalizes those builtins.
const clientPolyfills: Plugin = {
  name: "client-polyfills",
  enforce: "pre",
  applyToEnvironment(environment) {
    return environment.name === "client"
  },
  configEnvironment(name) {
    if (name !== "client") return
    return { define: { global: "globalThis" } }
  },
  resolveId(source) {
    if (source !== "crypto" && source !== "stream") return null
    const target =
      source === "crypto" ? "crypto-browserify" : "stream-browserify"
    return require.resolve(target)
  },
}

// pnpm puts the generated client beside @prisma/client, and the specifier
// starts with a dot, so Vite does not resolve it. The Worker build's
// conditions (workerd) then select the edge entry, which imports the query
// compiler Wasm. The Node entry compiles that Wasm at runtime, which Workers
// forbid. Scripts do not use this plugin and keep the Node entry.
const generatedPrismaClient = resolve(
  realpathSync(dirname(require.resolve("@prisma/client/package.json"))),
  "../../.prisma/client"
)

// The Cloudflare plugin prebundles the Worker with esbuild's neutral
// platform, which ignores package.json "main" unless mainFields is set.
// @react-icons/all-files (wallet icons) resolves through that field.
const workerDepMainFields: Plugin = {
  name: "worker-dep-main-fields",
  configEnvironment(name) {
    if (name !== "ssr") return
    return {
      optimizeDeps: {
        esbuildOptions: {
          mainFields: ["module", "main", "browser"],
          plugins: [
            {
              name: "buffer-slash",
              setup(build) {
                build.onResolve({ filter: /^buffer\/$/ }, () => ({
                  path: bufferPolyfill,
                }))
              },
            },
            workerWasmEsbuildPlugin,
          ],
        },
      },
    }
  },
}

const prismaWorkerResolve: Plugin = {
  name: "prisma-worker-resolve",
  enforce: "pre",
  applyToEnvironment(environment) {
    return environment.name === "ssr"
  },
  resolveId(source) {
    const prefix = ".prisma/client"
    if (source !== prefix && !source.startsWith(`${prefix}/`)) return null
    const sub = source === prefix ? "default.js" : source.slice(prefix.length + 1)
    const direct = resolve(generatedPrismaClient, sub)
    if (existsSync(direct)) return direct
    if (existsSync(`${direct}.js`)) return `${direct}.js`
    return null
  },
}

export default defineConfig({
  // Keep the existing NEXT_PUBLIC_ names so Workers Builds and the cron
  // workflow do not need new variables. Vite otherwise only exposes VITE_.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    tsconfigPaths(),
    bufferSlash,
    clientPolyfills,
    workerDepMainFields,
    prismaWorkerResolve,
    workerWasmPlugin(),
  ],
})
