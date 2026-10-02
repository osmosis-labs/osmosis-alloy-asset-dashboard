// Small values the cron needs to remember between runs. The GitHub Actions
// runner starts a fresh process for every run, so it sets CRON_STATE_FILE and
// carries the file between runs (actions cache, see .github/workflows/cron.yml).
// Without it, values live in module memory. Kept out of the database: reading
// state there would add a billed operation to every run. Reads and writes are
// best-effort; a missing or unreadable file reads as the fallback.
import fs from "node:fs"
import path from "node:path"

type State = Record<string, unknown>

const memory: State = {}

const readFile = (file: string): State => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as State
  } catch {
    return {}
  }
}

export const hasCronStateFile = (): boolean => !!process.env.CRON_STATE_FILE

export function readCronState<T>(key: string, fallback: T): T {
  const file = process.env.CRON_STATE_FILE
  const state = file ? readFile(file) : memory
  return key in state ? (state[key] as T) : fallback
}

export function writeCronState(key: string, value: unknown): void {
  const file = process.env.CRON_STATE_FILE
  if (!file) {
    memory[key] = value
    return
  }
  try {
    const state = readFile(file)
    state[key] = value
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state))
  } catch {
    // Best-effort: the next run reads the fallback.
  }
}
