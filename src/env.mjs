import { z } from "zod"

// NEXT_PUBLIC_ names are unchanged from the Next app: Workers Builds, preview
// vars, and the cron workflow already set them. process.env wins when it is
// set, so a Worker var or a script's environment overrides the value Vite
// inlined at build time.
const read = (name, viteValue) => {
  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess
  return typeof viteValue === "string" ? viteValue : undefined
}

// Static import.meta.env reads, so Vite inlines them into the client bundle
// (envPrefix in vite.config.mts). The condition skips the access under tsx,
// which has no import.meta.env.
const vite = (readValue) =>
  typeof import.meta !== "undefined" && import.meta.env ? readValue() : undefined

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_CODE_IDS: z
    .string()
    .min(1)
    .transform((v) => v.split(",")),
  NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID: z.string().min(1),
  MODE: z.enum(["development", "production"]).optional(),
})

export const env = schema.parse({
  NEXT_PUBLIC_APP_URL: read(
    "NEXT_PUBLIC_APP_URL",
    vite(() => import.meta.env.NEXT_PUBLIC_APP_URL)
  ),
  NEXT_PUBLIC_CODE_IDS: read(
    "NEXT_PUBLIC_CODE_IDS",
    vite(() => import.meta.env.NEXT_PUBLIC_CODE_IDS)
  ),
  NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID: read(
    "NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID",
    vite(() => import.meta.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID)
  ),
  MODE: read("MODE", undefined),
})
