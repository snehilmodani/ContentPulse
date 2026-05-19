# ContentPulse

**AI-powered social media content pipeline for solo creators.**

ContentPulse watches what's trending, generates on-brand content angles, researches them, writes multi-format drafts, and packages everything ready to publish — all from a single dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify)](https://fastify.dev/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f?logo=drizzle)](https://orm.drizzle.team/)
[![BullMQ](https://img.shields.io/badge/BullMQ-job_queue-red)](https://bullmq.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-ef4444?logo=turborepo)](https://turbo.build/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What it does

Solo creators spend hours finding trends, researching angles, and writing copy for every platform. ContentPulse automates that pipeline end-to-end, from trend discovery to a ready-to-post content package — so you can focus on publishing, not producing.

**Feature pipeline:**

- **Trend harvesting** — pulls from X/Twitter, NewsAPI, Reddit, YouTube, and Google Trends on a daily schedule or on demand
- **Idea generation** — Claude produces five content angles per trend, scored for relevance and mapped to your niche/tone
- **Research briefs** — Perplexity deep-dives the approved idea before any copy is written
- **Multi-format drafts** — thread, carousel, short-form video script, long-form post, and newsletter — all in one job
- **Visual generation** — DALL-E 3 or Unsplash stock images, auto-uploaded to Cloudflare R2
- **Content packages** — ZIP everything into a portable bundle with one click

> **Zero paid keys required.** Every external API (AI, trends, images, email) has a deterministic stub adapter. The full pipeline runs out of the box for development and demos.

---

## How it works

```
Scheduler / API trigger
        │
        ▼
  Trend Harvesting ──► Idea Generation
                              │
                     User approves idea
                              │
                              ▼
                       Research Brief
                              │
                              ▼
                      Content Drafting ──► Visual Generation
                              │                    │
                              └────────┬───────────┘
                                       ▼
                               Content Package
                               (ZIP + R2 upload)
```

Each stage is a BullMQ job. Real-time progress flows back to the browser over WebSocket.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React Query, Zustand, Tailwind CSS |
| API | Fastify 4, @fastify/jwt, Drizzle ORM |
| Worker | BullMQ, node-cron, Luxon |
| Database | PostgreSQL 16 (Drizzle migrations) |
| Cache / Queue | Redis 7 |
| AI | OpenRouter → Claude (ideas, drafts), Perplexity (research), DALL-E 3 (visuals) |
| Storage | Cloudflare R2 (falls back to `./tmp/r2/` locally) |
| Monorepo | Turborepo + pnpm workspaces |

---

## Quickstart

**Prerequisites:** Node >= 20, pnpm >= 9, Docker (for Postgres + Redis)

```bash
# 1. Clone and install
git clone https://github.com/snehilmodani/ContentPulse.git
cd ContentPulse
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — only DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET are required.
# All API keys are optional; stub adapters run automatically when they're blank.

# 3. Start (runs pre-flight checks, Docker, migrations, then dev servers)
pnpm start
```

| App | URL |
|---|---|
| Web dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| DB Studio | `pnpm db:studio` |

`pnpm start` handles Docker (`docker compose up -d`), migrations, and type/lint/test checks before launching the dev servers. To skip checks and start immediately, use `pnpm dev`.

---

## Project layout

```
apps/
  api/      Fastify REST + WebSocket server (port 3001)
  web/      Next.js 14 app router frontend (port 3000)
  worker/   BullMQ consumer + node-cron scheduler (headless)
packages/
  db/       Drizzle ORM schema + client (postgres-js, singleton getDb())
  types/    Shared TS types, enums, job payload interfaces
  config/   Zod-validated env schemas (ApiEnv, WorkerEnv, WebEnv)
  ai-client/ OpenRouter wrapper (AnthropicClient) with token-budget tracking
```

---

## Configuration

ContentPulse is designed to run with zero external accounts for local development. All adapters check for an empty env var and fall back to deterministic mock data.

**Required** (the app will not start without these):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | At least 32 characters |
| `JWT_REFRESH_SECRET` | At least 32 characters, different from above |

**Optional with stub fallback** (leave blank to use stubs):

| Variable | Enables |
|---|---|
| `OPENROUTER_API_KEY` | Real Claude / Perplexity calls |
| `OPENAI_API_KEY` | Real DALL-E 3 image generation |
| `X_API_BEARER_TOKEN` | Live X/Twitter trends |
| `NEWSAPI_KEY` | Live news trends |
| `R2_ACCOUNT_ID` + friends | Cloudflare R2 storage (falls back to `./tmp/r2/`) |
| `RESEND_API_KEY` | Email notifications |

See [`.env.example`](.env.example) for the complete list.

---

## Commands

```bash
pnpm start                        # pre-flight + dev (recommended)
pnpm dev                          # start all apps immediately
pnpm build                        # production build
pnpm typecheck                    # tsc across all packages
pnpm lint                         # eslint across all packages
pnpm test                         # run all tests
pnpm db:generate                  # regenerate migrations after schema change
pnpm db:migrate                   # apply migrations
pnpm db:studio                    # Drizzle Studio GUI
```

Per-package test shortcuts:

```bash
pnpm test:api
pnpm test:worker
pnpm test:web
pnpm test:ai-client
pnpm test:watch                   # watch mode
```

---

## Testing

Tests are written with Vitest and live in `test/` alongside each package's `src/`. The suite covers API routes, worker jobs, adapters, sources, and frontend utilities — **264 tests across 7 packages**, all running without any external services.

```bash
pnpm test          # all packages
pnpm test:api      # Fastify route tests
pnpm test:worker   # job processor + adapter tests
pnpm test:web      # apiFetch, apiUpload, cn utility
```

---

## Status

**Phase 1 MVP** — the full pipeline from trend harvesting to content packaging is complete. The `published_posts` and `post_analytics` tables are scaffolded in the schema but have no write path yet (Phase 2: scheduling and analytics).

---

## Further reading

[`CLAUDE.md`](CLAUDE.md) is the complete navigation guide for the codebase — DB schema, API routes, worker jobs, adapter details, and development conventions.

---

## License

[MIT](LICENSE)
