import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

// workerd rejects WebAssembly.instantiate(bytes) ("code generation disallowed").
// libsodium-sumo (pulled in by osmojs / @cosmjs/crypto 0.32) and yoga-layout
// (inlined in @vercel/og) both compile embedded base64 at import time, and the
// failure aborts the request's other fetches. The emscripten glue already
// honors `instantiateWasm`. Point that at a module the Worker compiled ahead
// of time. Node scripts leave the global unset and keep the base64 path.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const generatedDir = resolve(root, ".generated")

// Not direct dependencies, and pnpm does not let the project root resolve them.
const pnpmDir = resolve(root, "node_modules/.pnpm")
const pnpmPkg = (prefix: string, subpath: string) => {
  const dir = readdirSync(pnpmDir).find((name) => name.startsWith(prefix))
  if (!dir) throw new Error(`missing ${prefix} under node_modules/.pnpm`)
  return resolve(pnpmDir, dir, "node_modules", subpath)
}

const sodiumJs = pnpmPkg(
  "libsodium-sumo@",
  "libsodium-sumo/dist/modules-sumo/libsodium-sumo.js"
)
const yogaJs = pnpmPkg(
  "yoga-layout@",
  "yoga-layout/dist/binaries/yoga-wasm-base64-esm.js"
)
const ogFontBase64 = readFileSync(
  resolve(root, "node_modules/@vercel/og/dist/noto-sans-v27-latin-regular.ttf")
).toString("base64")

export const sodiumWasmFile = resolve(generatedDir, "libsodium-sumo.wasm")
export const yogaWasmFile = resolve(generatedDir, "yoga.wasm")

const writeWasm = (jsPath: string, outPath: string) => {
  const source = readFileSync(jsPath, "utf8")
  const match = source.match(
    /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/
  )
  if (!match) throw new Error(`no embedded wasm in ${jsPath}`)
  const bytes = Buffer.from(match[1], "base64")
  if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73) {
    throw new Error(`embedded bytes in ${jsPath} are not wasm`)
  }
  mkdirSync(generatedDir, { recursive: true })
  writeFileSync(outPath, bytes)
}

writeWasm(sodiumJs, sodiumWasmFile)
writeWasm(yogaJs, yogaWasmFile)

// Assigns Module.instantiateWasm from globalThis.__workerWasm[key] when the
// Worker has published a precompiled module. Idempotent: a second pass no
// longer matches `if (mod.instantiateWasm)`.
// The glue checks `mod.instantiateWasm` as the last expression of an if, then
// `try { return mod.instantiateWasm(imports, receive) }`. libsodium writes that
// as `if(n++, deps?.(), B.instantiateWasm)try`, so the name is not the first
// token inside the paren. Match the name immediately before `) try`.
const instantiateWasmCall =
  /([A-Za-z_$][\w$]*)\.instantiateWasm\)(\s*try)/g

export const patchInstantiateWasm = (
  code: string,
  key: "sodium" | "yoga"
): string =>
  code.replace(instantiateWasmCall, (_full, mod: string, tryPart: string) => {
    const hook = `${mod}.instantiateWasm||(${mod}.instantiateWasm=globalThis.__workerWasm&&globalThis.__workerWasm.${key}?function(imports,receive){var src=globalThis.__workerWasm.${key};if(src&&src.default instanceof WebAssembly.Module)src=src.default;var pending=WebAssembly.instantiate(src,imports);var deliver=function(out){receive(out&&out.instance?out.instance:out)};if(pending&&typeof pending.then=="function"){pending.then(deliver,function(err){console.error("worker wasm instantiate failed",err);if(${mod}.onAbort)${mod}.onAbort(err)})}else{deliver(pending)}return{}}:null)`
    return `(${hook}))${tryPart}`
  })

// @vercel/og always fetches this font before drawing, even when the caller
// passes fonts. workerd in local dev cannot complete that fetch, and the image
// stream then ends empty. The file is 27KB; inline it.
const ogFontFetch =
  /var fallbackFont = fetch\(\s*new URL\(\s*"\.\/noto-sans-v27-latin-regular\.ttf",\s*import\.meta\.url\s*\)\s*\)\.then\(\(res\) => res\.arrayBuffer\(\)\);/

const patchOgFont = (code: string) =>
  code.replace(
    ogFontFetch,
    `var fallbackFont = Promise.resolve(Uint8Array.from(atob("${ogFontBase64}"), function(c){return c.charCodeAt(0)}).buffer);`
  )

const keyFor = (id: string): "sodium" | "yoga" | null => {
  const path = id.split("?")[0]
  if (path.endsWith("libsodium-sumo.js") && path.includes("modules-sumo")) {
    return "sodium"
  }
  if (path.endsWith("yoga-wasm-base64-esm.js")) return "yoga"
  // pnpm stores the package under @vercel+og, then junctions to @vercel/og.
  if (
    path.includes("/@vercel/og/dist/index.") &&
    (path.endsWith("index.edge.js") || path.endsWith("index.node.js"))
  ) {
    return "yoga"
  }
  return null
}

export const workerWasmEsbuildPlugin = {
  name: "worker-wasm",
  setup(build: {
    onLoad: (
      options: { filter: RegExp },
      callback: (args: { path: string }) =>
        | null
        | { contents: string; loader: "js"; resolveDir: string }
    ) => void
  }) {
    build.onLoad(
      {
        filter:
          /libsodium-sumo\.js$|yoga-wasm-base64-esm\.js$|index\.(edge|node)\.js$/,
      },
      (args) => {
        const key = keyFor(args.path)
        if (!key) return null
        let contents = patchInstantiateWasm(readFileSync(args.path, "utf8"), key)
        if (args.path.includes("/@vercel/og/")) contents = patchOgFont(contents)
        return {
          contents,
          loader: "js",
          resolveDir: dirname(args.path),
        }
      }
    )
  },
}

export const workerWasmPlugin = (): Plugin => ({
  name: "worker-wasm",
  enforce: "pre",
  transform(code, id) {
    const key = keyFor(id)
    if (!key) return null
    const patched = id.includes("/@vercel/og/")
      ? patchOgFont(patchInstantiateWasm(code, key))
      : patchInstantiateWasm(code, key)
    return { code: patched, map: null }
  },
})
