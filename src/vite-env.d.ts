/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_APP_URL?: string
  readonly NEXT_PUBLIC_CODE_IDS?: string
  readonly NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID?: string
  readonly MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
