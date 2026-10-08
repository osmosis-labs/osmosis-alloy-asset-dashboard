// `?module` is the Cloudflare convention: the import is a WebAssembly.Module,
// not Vite's default wasm init function. workerd rejects compiling bytes.
declare module "*.wasm?module" {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}

declare var __workerWasm:
  | {
      sodium?: WebAssembly.Module
      yoga?: WebAssembly.Module
    }
  | undefined
