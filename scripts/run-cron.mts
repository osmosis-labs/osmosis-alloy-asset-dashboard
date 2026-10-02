// Runs the activity cron route in-process, outside the web host:
//
//   pnpm cron
//
// The scheduled GitHub Actions workflow (.github/workflows/cron.yml) uses this
// so the cron needs nothing from the web host. It calls the route's GET
// handler directly with a per-run CRON_SECRET, so the route's existing auth
// check passes without a shared secret. Exits non-zero when the route answers
// with an error status, so a failed run fails the job.
import { randomBytes } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"

process.env.CRON_SECRET ||= randomBytes(32).toString("hex")

const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href)

// The route answers 200 "skipped" without a database (fine for a web host
// with the store not connected), which here would leave scheduled runs green
// while nothing is ingested.
const { isDatabaseEnabled } = await imp("src/lib/database.ts")
if (!isDatabaseEnabled()) {
  console.error(
    "activity: no database URL (DATABASE_URL, POSTGRES_PRISMA_URL or POSTGRES_URL); not running"
  )
  process.exit(1)
}

const { GET } = await imp("src/app/api/cron/activity/route.ts")

const started = Date.now()
const response: Response = await GET(
  new Request("http://localhost/api/cron/activity", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
)
const body = await response.text()
console.log(
  `activity: ${response.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`
)
console.log(body)
process.exit(response.ok ? 0 : 1)
