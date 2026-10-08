# Osmosis Alloy Asset Dashboard

React Router 8 on Cloudflare Workers, built with Vite. Pool pages are server-rendered. The activity ingest runs from GitHub Actions, not in the Worker.

Workers Builds should run `pnpm cf:build` before deploy. That generates the Prisma client and bundles the Worker. The Vite plugin ignores a Wrangler build command.

## Usage

```bash
cp .env.example .env.local
```

```bash
pnpm install
```

```bash
pnpm dev
```
