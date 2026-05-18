# ContentPulse — CLAUDE.md

AI-powered social media content pipeline for solo creators. Turborepo + pnpm monorepo.

## Running locally

```bash
cp .env.example .env          # fill DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET
pnpm install
pnpm db:generate && pnpm db:migrate
pnpm dev                      # web :3000  |  api :3001  |  worker headless
```

DB studio: `pnpm db:studio` — Schema migrations: `pnpm db:generate` (after editing `packages/db/src/schema.ts`)

## Monorepo layout

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

## Auth — local only, no Supabase

- Bcrypt (cost 12) password hashing; rotating JWT refresh tokens stored in `refresh_tokens` table
- Access token: `@fastify/jwt`, verified by `fastify.authenticate` preHandler (`apps/api/src/plugins/auth.ts`)
- Web stores tokens in `localStorage`; `apiFetch()` in `apps/web/lib/api-client.ts` auto-refreshes on 401
- `users` table has `password_hash TEXT NOT NULL`; `supabase_uid` is nullable forward-compat placeholder

## Database (Drizzle + PostgreSQL)

Schema lives in `packages/db/src/` — never edit migration SQL directly, always re-run `pnpm db:generate`.

**14 tables:**
| Table | Purpose |
|---|---|
| `users` | Accounts; `timezone`, `onboarding_complete` |
| `refresh_tokens` | Rotating refresh token store |
| `domain_profiles` | Creator niche/tone/region config |
| `brand_kits` | Colors, fonts, logo URLs |
| `trend_runs` | One scheduled harvest per user per day |
| `trends` | Individual trend records with engagement score |
| `ideas` | AI-generated content angles per trend |
| `content_packages` | Bundles (idea + drafts + visuals) |
| `topic_briefs` | Perplexity research output per package |
| `drafts` | Per-platform copy (thread/carousel/short/long/newsletter) |
| `visuals` | Image records with R2 URL + generation metadata |
| `published_posts` | Phase 2 — no write path yet |
| `post_analytics` | Phase 2 — no write path yet |
| `notifications` | In-app / email / push notification log |

## API routes (all under `/v1` except health)

| File | Prefix | Key endpoints |
|---|---|---|
| `routes/auth.ts` | `/auth` | POST /register, /login, /refresh, /logout |
| `routes/users.ts` | `/users` | GET /me, PATCH /me, onboarding |
| `routes/trends.ts` | `/trends` | trend-run CRUD, manual trigger |
| `routes/ideas.ts` | `/ideas` | list ideas per run, approve/reject/defer |
| `routes/packages.ts` | `/packages` | package CRUD, export trigger |
| `routes/drafts.ts` | `/drafts` | list/approve/regenerate drafts |
| `routes/visuals.ts` | `/visuals` | list/approve/regenerate visuals |
| `routes/notifications.ts` | `/notifications` | list, mark read |
| `ws/index.ts` | `/ws` | WebSocket — authenticated via token query param |

Fastify decorators available everywhere: `fastify.db` (Drizzle), `fastify.redis` (IORedis), `fastify.r2` (R2StorageClient), `fastify.authenticate` (preHandler).

## Worker jobs (BullMQ)

All jobs in `apps/worker/src/jobs/<name>/index.ts`. Each exports a `process*` function that receives a typed `Deps` object.

| Queue name | Job | Triggered by |
|---|---|---|
| `trend-harvesting` | Harvest X/news trends, write `trends` rows, enqueue idea-gen | Scheduler (daily) or manual API |
| `idea-generation` | Claude → generate content angles, write `ideas` | trend-harvesting |
| `research-brief` | Perplexity → topic brief, write `topic_briefs` | idea approval |
| `content-drafting` | Claude → write all draft formats, write `drafts` | research-brief |
| `draft-regeneration` | Claude → rewrite single draft | user action |
| `visual-generation` | DALL·E / Unsplash → generate images, write `visuals`, upload R2 | content-drafting |
| `visual-regeneration` | DALL·E / Unsplash → regenerate single visual | user action |
| `export-package` | Bundle package as ZIP, upload R2, notify | user action |
| `notification-send` | Resend email / push via VAPID | various |

Scheduler: `apps/worker/src/scheduler/index.ts` — runs a `* * * * *` cron, fires `trend-harvesting` once per user per day at their local 9 AM (Luxon timezone check).

## External API adapters (stub pattern)

All adapters check for an empty env var and return deterministic mock data when unset — the full pipeline runs without any paid keys.

| Adapter | File | Real env var |
|---|---|---|
| X (Twitter) | `sources/x.ts` | `X_API_BEARER_TOKEN` |
| NewsAPI | `sources/newsapi.ts` | `NEWSAPI_KEY` |
| Reddit | `sources/reddit.ts` | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` |
| YouTube | `sources/youtube.ts` | `YOUTUBE_API_KEY` |
| Google Trends | `sources/google-trends.ts` | (no key — scrape, always stubbed in CI) |
| DALL·E | `adapters/dalle.ts` | `OPENAI_API_KEY` |
| Unsplash | `adapters/unsplash.ts` | `UNSPLASH_ACCESS_KEY` |
| Resend | `adapters/resend.ts` | `RESEND_API_KEY` |
| Perplexity (via ai-client) | `packages/ai-client/src/index.ts` | `OPENROUTER_API_KEY` |

Worker bypass flags: `BYPASS_VISUAL_GENERATION=1`, `BYPASS_RESEARCH=1` skip those stages entirely.

## AI client (`packages/ai-client`)

`AnthropicClient` — wraps OpenRouter (not Anthropic directly). Tracks per-user token budget in Redis. Stubs when `OPENROUTER_API_KEY` is empty. Config in `packages/config/src/worker.ts`:
- `AI_MODEL_GENERATION` (default: `anthropic/claude-haiku-4.5`)
- `AI_MODEL_RESEARCH` (default: `anthropic/claude-haiku-4.5`)

## R2 storage

Falls back to local `./tmp/r2/` when R2 env vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_KEY`) are absent. Both api and worker have their own `lib/r2.ts` instance.

## Frontend (Next.js 14 app router)

- Route groups: `(auth)` — login/register; `(app)` — authenticated shell with sidebar
- State: React Query for server state, Zustand for client UI state
- Data fetching: `apiFetch()` from `apps/web/lib/api-client.ts` — handles auth headers + token refresh

**Screens:**
| Route | File |
|---|---|
| `/dashboard` | `(app)/dashboard/page.tsx` |
| `/trend-runs` | `(app)/trend-runs/page.tsx` |
| `/trend-runs/[id]` | `(app)/trend-runs/[id]/page.tsx` |
| `/packages` | `(app)/packages/page.tsx` |
| `/packages/[id]` | `(app)/packages/[id]/page.tsx` |
| `/queue` | `(app)/queue/page.tsx` |
| `/brand-kit` | `(app)/brand-kit/page.tsx` |
| `/settings` | `(app)/settings/page.tsx` |

## Key constraints

- No Supabase SDK anywhere — auth is local JWT only
- No Supabase client imports — `@supabase/supabase-js` is not installed
- `published_posts` and `post_analytics` tables exist but have no write path (Phase 2)
- Trend source narrowed to X-only by default; other sources are stubbed
- Worker job `lockDuration` is 120s; timeout-sensitive jobs have explicit abort signals
- Package imports: always use workspace aliases (`@contentpulse/db`, `@contentpulse/types`, etc.) — never relative cross-package paths

## Common commands

```bash
pnpm dev                          # start all apps
pnpm typecheck                    # run tsc across all packages
pnpm lint                         # eslint across all packages
pnpm --filter @contentpulse/db db:generate   # regenerate migrations after schema change
pnpm --filter @contentpulse/db db:migrate    # apply migrations
pnpm --filter @contentpulse/db db:studio     # Drizzle Studio GUI
```

### Testing

```bash
pnpm test                         # run all tests across every package (via Turbo)
pnpm test:api                     # API only  — errors, auth routes
pnpm test:worker                  # worker only — adapters, sources, lib helpers
pnpm test:web                     # web only  — apiFetch, apiUpload, cn utility
pnpm test:ai-client               # ai-client only — error classes
pnpm test:watch                   # re-run all tests on file change (watch mode)
```

Test files live in `test/` beside each package's `src/`. Vitest is configured per-package (`vitest.config.ts`). The web package uses `jsdom` environment; all others use `node`.
