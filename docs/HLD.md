# ContentPulse — System Design HLD
## Phase 1 MVP

**Version:** 1.0 | **Date:** 2026-05-13 | **Status:** Implementation-Ready  
**Source PRD:** `/Users/snehil_modani/Downloads/PRD_ContentIntelligencePlatform.md`  
**Output target:** `/Users/snehil_modani/repos/personal/ContentPulse/docs/HLD.md` (greenfield repo)

---

## Context

ContentPulse automates the full social-media content lifecycle for solo creators via a nightly 5-stage pipeline. The PRD is finalized and the repo is empty. This HLD translates PRD requirements into a concrete, implementation-ready architecture covering: component topology, database schema, REST + WebSocket API contracts, BullMQ job queue design, and infrastructure spec for Phase 1 MVP (~100 users).

---

## Table of Contents

1. [Component Architecture](#1-component-architecture)
2. [Database Schema](#2-database-schema)
3. [API Contract Definitions](#3-api-contract-definitions)
4. [Job Queue Design (BullMQ)](#4-job-queue-design-bullmq)
5. [Infrastructure Topology](#5-infrastructure-topology)
6. [Key Design Decisions](#6-key-design-decisions)
7. [Critical Files for Implementation](#7-critical-files-for-implementation)
8. [Verification Plan](#8-verification-plan)

---

## 1. Component Architecture

### 1.1 System Component Map

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                              CONTENTPULSE SYSTEM ARCHITECTURE                        ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║  │                         CLIENT TIER  (Browser / PWA)                        │    ║
║  │                                                                               │    ║
║  │   ┌────────────────────────────────────────────────────────────────────┐    │    ║
║  │   │                   Next.js 14 App Router (Vercel)                    │    │    ║
║  │   │   TypeScript · Tailwind CSS · shadcn/ui · Zustand · React Query    │    │    ║
║  │   │                                                                      │    │    ║
║  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │    ║
║  │   │  │  Dashboard   │  │ Review Queue │  │Content Review│             │    │    ║
║  │   │  │  /dashboard  │  │   /queue     │  │ /packages/:id│             │    │    ║
║  │   │  └──────────────┘  └──────────────┘  └──────────────┘             │    │    ║
║  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │    ║
║  │   │  │Domain Profile│  │  Brand Kit   │  │   Settings   │             │    │    ║
║  │   │  │  /profile    │  │  /brand-kit  │  │  /settings   │             │    │    ║
║  │   │  └──────────────┘  └──────────────┘  └──────────────┘             │    │    ║
║  │   │  WebSocket Client ────────────────────────────────────────────┐   │    │    ║
║  │   └────────────────────────────────────────────────────────────────────┘    │    ║
║  └─────────────────────────────────────────────────────────────────────────────┘    ║
║                │  HTTPS/WSS (Cloudflare CDN edge)                                   ║
║                ▼                                                                     ║
║  ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║  │                        APPLICATION TIER  (Railway)                          │    ║
║  │                                                                               │    ║
║  │  ┌──────────────────────────────────┐   ┌──────────────────────────────┐   │    ║
║  │  │       Fastify API Server          │   │     BullMQ Worker Process     │   │    ║
║  │  │  (api.contentpulse.app:3001)      │   │     (worker.internal:3002)    │   │    ║
║  │  │                                   │   │                               │   │    ║
║  │  │  REST Route Handlers              │   │  trend-harvesting             │   │    ║
║  │  │  /auth  /users  /trends           │   │  idea-generation              │   │    ║
║  │  │  /ideas /packages /drafts         │   │  research-brief               │   │    ║
║  │  │  /visuals /export                 │   │  content-drafting             │   │    ║
║  │  │                                   │   │  visual-generation            │   │    ║
║  │  │  WebSocket Server (/v1/ws)        │   │  export-package               │   │    ║
║  │  │  pipeline_progress events         │   │  notification-send            │   │    ║
║  │  │                                   │   │                               │   │    ║
║  │  │  Supabase Auth Middleware         │   │  Node-Cron Scheduler          │   │    ║
║  │  │  JWT verification                 │   │  9 PM/tz daily fire           │   │    ║
║  │  └──────────────────────────────────┘   └──────────────────────────────┘   │    ║
║  └─────────────────────────────────────────────────────────────────────────────┘    ║
║           │ SQL              │ Redis                    │ HTTP/SDK                   ║
║           ▼                  ▼                          ▼                            ║
║  ┌──────────────────┐  ┌──────────────────┐   ┌──────────────────────────────────┐ ║
║  │  DATA TIER        │  │  QUEUE / CACHE   │   │   EXTERNAL SERVICES TIER         │ ║
║  │                   │  │                   │   │                                   │ ║
║  │  PostgreSQL        │  │  Upstash Redis    │   │  AI: Anthropic claude-sonnet-4-6 │ ║
║  │  (Neon/Railway)   │  │  BullMQ queues    │   │  AI: OpenAI DALL·E 3             │ ║
║  │  13 tables         │  │  Session cache    │   │  Research: Perplexity API        │ ║
║  │                   │  │  Rate-limit keys  │   │  Trends: X API v2                │ ║
║  │  Cloudflare R2    │  └──────────────────┘   │  Trends: Google Trends           │ ║
║  │  /visuals/        │                           │  Trends: NewsAPI, Reddit, YouTube│ ║
║  │  /exports/        │                           │  Media: Unsplash / Pexels        │ ║
║  │  /brand/          │                           │  Email: Resend                   │ ║
║  └──────────────────┘                           │  Push: Web Push VAPID             │ ║
║                                                  │  Auth: Supabase Auth              │ ║
║                                                  └──────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

### 1.2 Pipeline Data Flow (Happy Path)

```
9:00 PM (user tz)
      │
      ▼  Node-Cron fires → enqueues trend-harvesting job (BullMQ)
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Trend Harvesting  (~5 min)                                 │
│  Calls: X API v2, Google Trends, NewsAPI, Reddit, YouTube            │
│  Claude embeddings for relevance scoring                             │
│  Writes: TrendRun + Trends to PostgreSQL                             │
└──────────────────────────────┬──────────────────────────────────────┘
                                │ enqueues idea-generation job
┌──────────────────────────────▼──────────────────────────────────────┐
│  STAGE 2a: Idea Generation  (~5 min)                                 │
│  Claude API: 3–5 ideas per top trend                                 │
│  Writes: Ideas to PostgreSQL                                         │
│  Enqueues: notification-send (daily_digest_ready)                    │
└──────────────────────────────┬──────────────────────────────────────┘
                                │ 9:10 PM — user notified, opens Review Queue
                                │ User: POST /ideas/:id/approve
┌──────────────────────────────▼──────────────────────────────────────┐
│  STAGE 3a: Research Brief  (~8 min)                                  │
│  Perplexity API: full topic brief                                    │
│  Writes: TopicBrief to PostgreSQL                                    │
└──────────┬────────────────────────────────────────────┬─────────────┘
           │ enqueues (parallel)                        │
┌──────────▼──────────────┐               ┌────────────▼──────────────┐
│  STAGE 3b: Drafting      │               │  STAGE 3c: Visuals         │
│  Claude: 5 format drafts │               │  DALL·E 3 + Unsplash/Pexels│
│  Writes Drafts to PG     │               │  Uploads to R2             │
└──────────┬──────────────┘               └────────────┬──────────────┘
           │ Redis INCR coordination (both done → 2)   │
           └───────────────────┬───────────────────────┘
                               │ WebSocket: package_ready + push notification
                               │ User reviews → POST /drafts/:id/approve
                               │ User: POST /content-packages/:id/export
┌──────────────────────────────▼──────────────────────────────────────┐
│  STAGE 4: Export                                                      │
│  Assembles ZIP (copy .txt/.md + sized PNGs + Post Checklist PDF)     │
│  Uploads to R2 → signed download URL (24h TTL)                      │
│  WebSocket: export_ready                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 Real-Time WebSocket Events (server → client)

| Event | Trigger |
|---|---|
| `pipeline_stage_started` | Any stage begins |
| `pipeline_stage_completed` | Any stage completes |
| `pipeline_stage_failed` | Stage exhausts retries |
| `ideas_ready` | Idea generation completes |
| `package_ready` | Both drafting + visuals done |
| `export_ready` | ZIP upload completes |
| `draft_regenerated` | On-demand regen completes |
| `visual_regenerated` | On-demand regen completes |

---

## 2. Database Schema

### 2.1 Enum Types

```sql
CREATE TYPE idea_status       AS ENUM ('pending','approved','rejected','deferred');
CREATE TYPE draft_format      AS ENUM ('x_thread','linkedin_article','linkedin_carousel','instagram_post','reel_script','blog_post');
CREATE TYPE draft_status      AS ENUM ('generating','draft','approved','rejected','regenerating');
CREATE TYPE visual_type       AS ENUM ('thumbnail','square_post','story_cover','carousel_slide','x_header');
CREATE TYPE visual_gen_method AS ENUM ('ai_dalle','web_unsplash','web_pexels','template');
CREATE TYPE visual_status     AS ENUM ('generating','ready','approved','regenerating');
CREATE TYPE trend_category    AS ENUM ('breaking_news','innovation_launch','evergreen_timely','cultural_comedic','contrarian_provocative');
CREATE TYPE trend_source      AS ENUM ('x_twitter','google_trends','newsapi','reddit','youtube');
CREATE TYPE run_status        AS ENUM ('pending','running','completed','failed','partial');
CREATE TYPE package_status    AS ENUM ('pending','researching','drafting','ready','approved','exported','rejected');
CREATE TYPE notification_channel AS ENUM ('email','push','in_app');
CREATE TYPE notification_event   AS ENUM ('daily_digest_ready','package_ready','export_ready','trend_spike');
CREATE TYPE branding_mode     AS ENUM ('strict','flexible');
CREATE TYPE angle_type        AS ENUM ('news','innovation','contrarian','comedic','tangential_insight','how_to');
CREATE TYPE effort_estimate   AS ENUM ('low','medium','high');
CREATE TYPE published_platform AS ENUM ('x_twitter','linkedin','instagram','youtube');
```

### 2.2 Core Tables (DDL)

```sql
-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid        TEXT        NOT NULL UNIQUE,
  email               TEXT        NOT NULL UNIQUE,
  display_name        TEXT,
  avatar_url          TEXT,
  timezone            TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  push_subscription   JSONB,                          -- Web Push subscription object
  email_notifications BOOLEAN     NOT NULL DEFAULT TRUE,
  push_notifications  BOOLEAN     NOT NULL DEFAULT TRUE,
  onboarding_complete BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_supabase_uid ON users (supabase_uid);

-- ── DOMAIN PROFILES ──────────────────────────────────────────────────────────
CREATE TABLE domain_profiles (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_domain     TEXT        NOT NULL,
  sub_domains        TEXT[]      NOT NULL DEFAULT '{}',
  target_audience    TEXT,
  creator_persona    TEXT,
  tone_of_voice      TEXT[]      NOT NULL DEFAULT '{}',
  content_mix_ratio  JSONB       NOT NULL DEFAULT '{}',  -- {"thought_leadership":40,"trending_news":40,"comedic":20}
  region             TEXT        NOT NULL DEFAULT 'IN-MH',
  inspiration_accounts TEXT[]    NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_domain_profile_user UNIQUE (user_id)
);

-- ── BRAND KITS ───────────────────────────────────────────────────────────────
CREATE TABLE brand_kits (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logo_r2_key      TEXT,
  logo_url         TEXT,
  primary_colors   TEXT[]        NOT NULL DEFAULT '{}',
  font_preferences JSONB         NOT NULL DEFAULT '{}',  -- {"heading":"Inter","body":"Roboto"}
  branding_mode    branding_mode NOT NULL DEFAULT 'flexible',
  extra_assets     JSONB         NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brand_kit_user UNIQUE (user_id)
);

-- ── TREND RUNS ───────────────────────────────────────────────────────────────
CREATE TABLE trend_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_date        DATE        NOT NULL,
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          run_status  NOT NULL DEFAULT 'pending',
  stage_timings   JSONB       NOT NULL DEFAULT '{}',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trend_run_user_date UNIQUE (user_id, run_date)
);
CREATE INDEX idx_trend_runs_user_id  ON trend_runs (user_id);
CREATE INDEX idx_trend_runs_run_date ON trend_runs (run_date);
CREATE INDEX idx_trend_runs_status   ON trend_runs (status);

-- ── TRENDS ───────────────────────────────────────────────────────────────────
CREATE TABLE trends (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_run_id         UUID           NOT NULL REFERENCES trend_runs(id) ON DELETE CASCADE,
  user_id              UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_platform      trend_source   NOT NULL,
  topic_name           TEXT           NOT NULL,
  topic_slug           TEXT           NOT NULL,
  category             trend_category NOT NULL,
  relevance_score      NUMERIC(4,2)   NOT NULL DEFAULT 0,
  trend_velocity       NUMERIC(8,2),
  engagement_potential NUMERIC(4,2),
  regional_score       NUMERIC(4,2),
  novelty_score        NUMERIC(4,2),
  composite_score      NUMERIC(5,2),
  raw_data             JSONB          NOT NULL DEFAULT '{}',
  topic_embedding      TEXT,          -- reserved for pgvector upgrade
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trends_trend_run_id    ON trends (trend_run_id);
CREATE INDEX idx_trends_composite_score ON trends (composite_score DESC);

-- ── IDEAS ────────────────────────────────────────────────────────────────────
CREATE TABLE ideas (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id         UUID            NOT NULL REFERENCES trends(id) ON DELETE CASCADE,
  trend_run_id     UUID            NOT NULL REFERENCES trend_runs(id) ON DELETE CASCADE,
  user_id          UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  angle_type       angle_type      NOT NULL,
  hook_line        TEXT            NOT NULL,
  core_argument    TEXT            NOT NULL,
  platform_fit     TEXT[]          NOT NULL DEFAULT '{}',
  effort_estimate  effort_estimate NOT NULL DEFAULT 'medium',
  relevance_score  NUMERIC(5,2)    NOT NULL DEFAULT 0,
  status           idea_status     NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  generation_meta  JSONB           NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ideas_trend_run_id ON ideas (trend_run_id);
CREATE INDEX idx_ideas_user_id      ON ideas (user_id);
CREATE INDEX idx_ideas_status       ON ideas (status);

-- ── CONTENT PACKAGES ─────────────────────────────────────────────────────────
CREATE TABLE content_packages (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id               UUID           NOT NULL REFERENCES ideas(id) ON DELETE RESTRICT,
  user_id               UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                package_status NOT NULL DEFAULT 'pending',
  selected_formats      draft_format[] NOT NULL DEFAULT '{x_thread,linkedin_article,instagram_post,reel_script,blog_post}',
  pipeline_progress     JSONB          NOT NULL DEFAULT '{}',
  export_r2_key         TEXT,
  export_url            TEXT,
  export_url_expires_at TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  exported_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_content_package_idea UNIQUE (idea_id)
);
CREATE INDEX idx_content_packages_user_id ON content_packages (user_id);
CREATE INDEX idx_content_packages_status  ON content_packages (status);

-- ── TOPIC BRIEFS ─────────────────────────────────────────────────────────────
CREATE TABLE topic_briefs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_package_id UUID        NOT NULL REFERENCES content_packages(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_summary      TEXT        NOT NULL,
  key_facts          JSONB       NOT NULL DEFAULT '[]',  -- [{fact, source_url, confidence}]
  timeline           JSONB       NOT NULL DEFAULT '[]',  -- [{date, event}]
  key_players        JSONB       NOT NULL DEFAULT '[]',  -- [{name, role, org}]
  opposing_views     TEXT,
  regional_angle     TEXT,
  related_topics     TEXT[]      NOT NULL DEFAULT '{}',
  sources            JSONB       NOT NULL DEFAULT '[]',  -- [{title, url, publication, published_at}]
  fact_check_flags   JSONB       NOT NULL DEFAULT '[]',  -- [{claim, flag, note}]
  research_meta      JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_topic_brief_package UNIQUE (content_package_id)
);

-- ── DRAFTS ───────────────────────────────────────────────────────────────────
CREATE TABLE drafts (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  content_package_id  UUID         NOT NULL REFERENCES content_packages(id) ON DELETE CASCADE,
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format              draft_format NOT NULL,
  status              draft_status NOT NULL DEFAULT 'generating',
  content_body        JSONB        NOT NULL DEFAULT '{}',  -- format-specific JSON (see note)
  regeneration_prompt TEXT,
  generation_meta     JSONB        NOT NULL DEFAULT '{}',
  version             INTEGER      NOT NULL DEFAULT 1,
  previous_versions   JSONB        NOT NULL DEFAULT '[]',
  approved_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_draft_package_format UNIQUE (content_package_id, format)
);
CREATE INDEX idx_drafts_content_package_id ON drafts (content_package_id);
CREATE INDEX idx_drafts_status             ON drafts (status);

/*
  content_body per format:
  x_thread:           { hook_tweet, tweets:[{number,text}], cta_tweet, hashtags }
  linkedin_article:   { title, hook, body (markdown), cta, estimated_read_time_minutes }
  linkedin_carousel:  { slides:[{slide_number,headline,body}], cover_slide, cta_slide }
  instagram_post:     { caption, hashtags, cta, image_brief }
  reel_script:        { hook_3s, full_script, storyboard:[{shot,description,on_screen_text,broll}], suggested_audio, word_count }
  blog_post:          { seo_title, meta_description, body (markdown), estimated_read_time_minutes, internal_link_suggestions }
*/

-- ── VISUALS ──────────────────────────────────────────────────────────────────
CREATE TABLE visuals (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  content_package_id  UUID              NOT NULL REFERENCES content_packages(id) ON DELETE CASCADE,
  user_id             UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visual_type         visual_type       NOT NULL,
  width_px            INTEGER           NOT NULL,
  height_px           INTEGER           NOT NULL,
  generation_method   visual_gen_method NOT NULL,
  status              visual_status     NOT NULL DEFAULT 'generating',
  r2_key              TEXT,
  cdn_url             TEXT,
  prompt_used         TEXT,
  source_url          TEXT,
  brand_kit_applied   BOOLEAN           NOT NULL DEFAULT FALSE,
  version             INTEGER           NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── PUBLISHED POSTS (Phase 2 write path; table created in Phase 1) ───────────
CREATE TABLE published_posts (
  id                 UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  content_package_id UUID               NOT NULL REFERENCES content_packages(id) ON DELETE RESTRICT,
  user_id            UUID               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform           published_platform NOT NULL,
  draft_id           UUID               REFERENCES drafts(id),
  external_post_id   TEXT,
  published_at       TIMESTAMPTZ,
  publish_meta       JSONB              NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- ── POST ANALYTICS (Phase 2 write path; table created in Phase 1) ────────────
CREATE TABLE post_analytics (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  published_post_id     UUID        NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impressions           BIGINT      NOT NULL DEFAULT 0,
  reach                 BIGINT      NOT NULL DEFAULT 0,
  likes                 INTEGER     NOT NULL DEFAULT 0,
  comments              INTEGER     NOT NULL DEFAULT 0,
  shares                INTEGER     NOT NULL DEFAULT 0,
  saves                 INTEGER     NOT NULL DEFAULT 0,
  clicks                INTEGER     NOT NULL DEFAULT 0,
  followers_gained      INTEGER     NOT NULL DEFAULT 0,
  video_views           INTEGER,
  video_completion_rate NUMERIC(5,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id            UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event         notification_event   NOT NULL,
  channel       notification_channel NOT NULL,
  title         TEXT                 NOT NULL,
  body          TEXT                 NOT NULL,
  payload       JSONB                NOT NULL DEFAULT '{}',
  sent_at       TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  failed_at     TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id ON notifications (user_id);

-- ── UPDATED_AT TRIGGER (apply to all mutable tables) ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
-- (Create BEFORE UPDATE trigger on each table)
```

---

## 3. API Contract Definitions

### Common Conventions
```
Base URL:     https://api.contentpulse.app/v1
Auth:         Authorization: Bearer <supabase_jwt>
Content-Type: application/json
Errors:       { "error": { "code": "IDEA_NOT_FOUND", "message": "..." } }
Pagination:   ?page=1&limit=20  →  { "data": [...], "meta": { page, limit, total } }
```

### 3.1 Auth
```typescript
// POST /auth/register   → 201: { user, session: { access_token, refresh_token, expires_at } }
// POST /auth/login      → 200: same shape
// GET  /auth/me         → 200: { id, email, display_name, timezone, onboarding_complete, ... }
// POST /auth/refresh    → 200: { access_token, expires_at }
// POST /auth/logout     → 204
```

### 3.2 Domain Profile
```typescript
// GET /users/:userId/domain-profile
// Response 200: { id, user_id, primary_domain, sub_domains[], target_audience,
//   creator_persona, tone_of_voice[], content_mix_ratio, region,
//   inspiration_accounts[], updated_at }
// Response 404: if not yet created

// PUT /users/:userId/domain-profile  (upsert)
// Body: { primary_domain (required), sub_domains?, target_audience?,
//         creator_persona?, tone_of_voice?, content_mix_ratio?,
//         region?, inspiration_accounts? }
// Response 200: DomainProfileResponse
```

### 3.3 Brand Kit
```typescript
// GET /users/:userId/brand-kit → 200: BrandKitResponse
// PUT /users/:userId/brand-kit → 200: BrandKitResponse
// POST /users/:userId/brand-kit/logo  (multipart/form-data, field: logo)
//   → 200: { logo_url, r2_key }
```

### 3.4 Trend Runs
```typescript
// GET /trend-runs?page&limit&status
// → 200: { data: [{ id, run_date, status, trend_count, idea_count, pending_idea_count }], meta }

// GET /trend-runs/:runId
// → 200: { id, run_date, status, stage_timings, trends: [{ id, topic_name, category, composite_score, idea_count }] }

// GET /trend-runs/:runId/ideas?status&angle_type&sort
// → 200: { data: [{ id, trend: {...}, angle_type, hook_line, platform_fit[], relevance_score, status }], meta }
```

### 3.5 Ideas — Human Checkpoint #1
```typescript
// GET /ideas/:ideaId → full idea with trend context

// POST /ideas/:ideaId/approve
// → 200: { idea_id, status: 'approved', content_package: { id, status: 'pending' } }
// Side effect: enqueues research-brief BullMQ job

// POST /ideas/:ideaId/reject  Body: { reason? }
// → 200: { idea_id, status: 'rejected' }

// POST /ideas/:ideaId/defer
// → 200: { idea_id, status: 'deferred' }
```

### 3.6 Content Packages
```typescript
// GET /content-packages/:packageId
// → 200: { id, idea_id, status, selected_formats[], pipeline_progress,
//           export_url?, draft_count, visual_count, ... }

// GET /content-packages/:packageId/brief  → full TopicBrief

// GET /content-packages/:packageId/drafts
// → 200: { data: [{ id, format, status, content_body, version }] }
```

### 3.7 Drafts — Human Checkpoint #2
```typescript
// GET /drafts/:draftId → full draft

// POST /drafts/:draftId/regenerate
// Body: { instruction: string }  // or preset: "make_provocative", "shorten_30pct", etc.
// → 202: { draft_id, status: 'regenerating', job_id }
// WebSocket: draft_regenerated on completion

// POST /drafts/:draftId/approve → 200: { draft_id, status: 'approved', approved_at }
// POST /drafts/:draftId/reject  Body: { reason? } → 200: { draft_id, status: 'rejected' }
```

### 3.8 Visuals
```typescript
// GET /visuals/:visualId → full visual object

// POST /visuals/:visualId/regenerate
// Body: { instruction?, generation_method?: 'ai_dalle'|'web_unsplash'|'web_pexels' }
// → 202: { visual_id, status: 'regenerating', job_id }
// WebSocket: visual_regenerated on completion
```

### 3.9 Export
```typescript
// POST /content-packages/:packageId/export
// → 202: { package_id, status: 'exporting', job_id }
// WebSocket: export_ready with { export_url (signed, 24h TTL), expires_at }
// Subsequent GET /content-packages/:id returns export_url
```

### 3.10 Notifications
```typescript
// GET /notifications?unread_only&limit → { data: Notification[], unread_count }
// POST /notifications/push-subscribe   Body: { subscription: PushSubscriptionJSON }
// POST /notifications/:id/read         → { notification_id, read_at }
```

### 3.11 WebSocket Event Envelope
```typescript
interface WSEnvelope {
  event: 'pipeline_stage_started' | 'pipeline_stage_completed' | 'pipeline_stage_failed'
       | 'ideas_ready' | 'package_ready' | 'export_ready'
       | 'draft_regenerated' | 'visual_regenerated';
  data: Record<string, unknown>;
  timestamp: string;  // ISO 8601
}
// Connection: wss://api.contentpulse.app/v1/ws?token=<jwt>
```

---

## 4. Job Queue Design (BullMQ)

### 4.1 Queue Taxonomy

| Queue | Purpose | Concurrency | Attempts | Backoff | Timeout |
|---|---|---|---|---|---|
| `trend-harvesting` | Nightly trend collection per user | 5 | 3 | Exponential 2s | 8 min |
| `idea-generation` | 3–5 angles per trend batch | 10 | 3 | Exponential 1s | 5 min |
| `research-brief` | Perplexity research for approved idea | 5 | 3 | Exponential 2s | 10 min |
| `content-drafting` | Claude: 5-format draft generation | 5 | 3 | Exponential 3s | 15 min |
| `visual-generation` | DALL·E 3 + web asset retrieval | 10 | 3 | Exponential 2s | 12 min |
| `export-package` | ZIP assembly + R2 upload | 10 | 3 | Linear 5s | 5 min |
| `notification-send` | Resend email + Web Push | 20 | 5 | Exponential 1s | 30 sec |
| `dlq` | Dead-letter: exhausted failed jobs | 1 (manual) | 0 | — | — |

### 4.2 Job Payload Shapes

```typescript
interface TrendHarvestingJobPayload {
  job_type: 'trend_harvesting';
  user_id: string;
  trend_run_id: string;
  domain_profile: { primary_domain: string; sub_domains: string[]; region: string; tone_of_voice: string[] };
  sources: Array<'x_twitter'|'google_trends'|'newsapi'|'reddit'|'youtube'>;
  scheduled_for: string;
}

interface IdeaGenerationJobPayload {
  job_type: 'idea_generation';
  user_id: string;
  trend_run_id: string;
  trend_ids: string[];
  domain_profile_id: string;
  ideas_per_trend: 5;
}

interface ResearchBriefJobPayload {
  job_type: 'research_brief';
  user_id: string;
  content_package_id: string;
  idea_id: string;
  idea: { hook_line: string; core_argument: string; angle_type: string };
  domain_profile: { primary_domain: string; region: string };
}

interface ContentDraftingJobPayload {
  job_type: 'content_drafting';
  user_id: string;
  content_package_id: string;
  topic_brief_id: string;
  idea_id: string;
  selected_formats: draft_format[];
  domain_profile: { tone_of_voice: string[]; creator_persona: string; content_mix_ratio: Record<string,number> };
  brand_kit: { branding_mode: 'strict'|'flexible' };
}

interface VisualGenerationJobPayload {
  job_type: 'visual_generation';
  user_id: string;
  content_package_id: string;
  idea_id: string;
  instagram_draft_id?: string;
  trend_category: string;
  visual_types: visual_type[];
  brand_kit: { logo_r2_key: string|null; primary_colors: string[]; branding_mode: 'strict'|'flexible' };
}

interface ExportPackageJobPayload {
  job_type: 'export_package';
  user_id: string;
  content_package_id: string;
  approved_draft_ids: string[];
  approved_visual_ids: string[];
}

interface NotificationSendJobPayload {
  job_type: 'notification_send';
  user_id: string;
  notification_id: string;
  event: notification_event;
  channels: Array<'email'|'push'>;
  template_data: Record<string, unknown>;
}

// Ad-hoc jobs (triggered from API)
interface DraftRegenerationJobPayload {
  job_type: 'draft_regeneration';
  user_id: string; draft_id: string; content_package_id: string;
  format: string; instruction: string; topic_brief_id: string;
}

interface VisualRegenerationJobPayload {
  job_type: 'visual_regeneration';
  user_id: string; visual_id: string; content_package_id: string;
  instruction?: string; override_method?: visual_gen_method;
}
```

### 4.3 Pipeline Job Chaining

```
SCHEDULER (Node-Cron, per user timezone)
  Every minute: check users with onboarding_complete=true who have no trend_run today
  → bullmq.add('trend-harvesting', payload, { jobId: `trend-${userId}-${date}`, delay: msUntil9PM })

WORKER: trend-harvesting
  → on success: bullmq.add('idea-generation', { trend_run_id, trend_ids })
  → on 3x failure: alert ops, DLQ

WORKER: idea-generation
  → on success: bullmq.add('notification-send', { event: 'daily_digest_ready' })
  → emit WS: ideas_ready
  → [waits for human: POST /ideas/:id/approve]

API: POST /ideas/:id/approve
  → creates content_package row
  → bullmq.add('research-brief', payload)

WORKER: research-brief
  → on success:
      bullmq.add('content-drafting', payload)    // sequential
      bullmq.add('visual-generation', payload)    // parallel

WORKER: content-drafting  AND  visual-generation (parallel)
  → Each: redis.incr(`pkg:${packageId}:stages_done`)
  → When value reaches 2:
      emit WS: package_ready
      bullmq.add('notification-send', { event: 'package_ready' })

API: POST /content-packages/:id/export
  → bullmq.add('export-package', payload)

WORKER: export-package
  → assembles ZIP → uploads to R2 → updates content_packages.export_url
  → emit WS: export_ready
  → bullmq.add('notification-send', { event: 'export_ready' })
```

### 4.4 Scheduler Design

```typescript
// Master cron (runs every minute, idempotent)
cron.schedule('* * * * *', async () => {
  const users = await db.query(`
    SELECT u.id, u.timezone FROM users u
    WHERE u.onboarding_complete = true
    AND NOT EXISTS (
      SELECT 1 FROM trend_runs tr
      WHERE tr.user_id = u.id AND tr.run_date = CURRENT_DATE
    )
  `);
  for (const user of users) {
    const now = DateTime.now().setZone(user.timezone);
    const target = now.set({ hour: 21, minute: 0, second: 0 });
    if (target > now) {
      await trendHarvestingQueue.add('trend-harvesting', { user_id: user.id }, {
        jobId: `trend-${user.id}-${now.toISODate()}`,  // idempotent
        delay: target.toMillis() - now.toMillis(),
        removeOnComplete: { age: 86400 * 7 },
        removeOnFail: false,
      });
    }
  }
});
```

### 4.5 Dead Letter Strategy

| Queue | On Failure | User Impact |
|---|---|---|
| trend-harvesting | Log + Sentry alert; DLQ | User can manually trigger from dashboard |
| idea-generation | Log; next nightly run recovers | Delayed digest |
| research-brief | Set package.status='failed', notify user | "Research failed — tap to retry" |
| content-drafting | Set package.status='failed', notify user | "Drafting failed — tap to retry" |
| visual-generation | Set visual.status='failed' | Package still shown; Regenerate button available |
| export-package | Notify user | "Export failed — tap to retry" |
| notification-send | Log only | No user-visible impact |

---

## 5. Infrastructure Topology

### 5.1 Topology Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              PUBLIC INTERNET                                   │
│   Browser / PWA: contentpulse.app                                              │
└──────────────────────────────────────────┬────────────────────────────────────┘
                                            │
                          ┌─────────────────▼──────────────────┐
                          │   CLOUDFLARE EDGE (CDN + WAF + TLS) │
                          │   contentpulse.app    → Vercel       │
                          │   api.contentpulse.app → Railway     │
                          └──────────────┬─────────────────────┘
                                         │
              ┌──────────────────────────┴─────────────────────────┐
              │                                                      │
┌─────────────▼────────────────┐              ┌────────────────────▼──────────────────┐
│  VERCEL  (PUBLIC)             │              │  RAILWAY  (ap-south-1, Mumbai)         │
│  Next.js 14 App Router        │              │                                         │
│  SSR + Static pages           │  REST+WSS   │  Fastify API  (api.contentpulse.app)   │
│  /dashboard, /queue,          │◄───────────►│  Port 3001 · REST + WS (/v1/ws)        │
│  /packages/[id], /settings    │              │  Supabase JWT middleware                │
│  Static assets via CF CDN     │              │                                         │
│  No server secrets             │              │  BullMQ Worker (PRIVATE, port 3002)    │
└──────────────────────────────┘              │  All 7 job processors + node-cron       │
                                               └──────────────────┬────────────────────┘
                                                                   │ private network
                  ┌────────────────────────────────────────────────┼──────────────────┐
                  │                                                  │                  │
   ┌──────────────▼──────────────┐  ┌──────────────────────────────▼─┐  ┌────────────▼────────────┐
   │  NEON / RAILWAY POSTGRES     │  │  UPSTASH REDIS (TLS)            │  │  CLOUDFLARE R2           │
   │  Database: contentpulse_prod │  │  BullMQ job queues              │  │  Public bucket + CF CDN  │
   │  13 tables, PgBouncer        │  │  Session cache (JWT deny-list)  │  │  /visuals/{userId}/      │
   │  Daily automated backups     │  │  Rate-limit counters            │  │  /exports/{packageId}/   │
   │  Max connections: 100        │  │  Pipeline coordination keys     │  │  /brand/{userId}/        │
   │                              │  │  Max memory: 256MB              │  │  Signed upload URLs      │
   └──────────────────────────────┘  └────────────────────────────────┘  └──────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
   │  SUPABASE (Auth only)  · JWT issuance · OAuth social providers · UID synced to users table  │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
   │  MONITORING  · Sentry (frontend + backend) · PostHog (product analytics) · Uptime Robot     │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Monorepo Structure (Turborepo + pnpm)

```
contentpulse/
├── apps/
│   ├── web/           # Next.js (Vercel)
│   │   └── app/dashboard/, /queue, /packages/[id], /settings
│   ├── api/           # Fastify REST + WebSocket (Railway service 1)
│   │   └── src/routes/, middleware/, plugins/
│   └── worker/        # BullMQ workers + cron (Railway service 2)
│       └── src/jobs/trend-harvesting/, idea-generation/, research-brief/,
│                content-drafting/, visual-generation/, export-package/,
│                notification-send/, scheduler/
├── packages/
│   ├── db/            # Drizzle ORM schema + migrations (single source of truth)
│   ├── types/         # Shared TypeScript interfaces
│   ├── config/        # Env parsing with Zod
│   └── ai-client/     # Anthropic SDK wrapper (prompt caching, retry, budget guardrails)
├── scripts/migrate.ts
├── .github/workflows/ci.yml + deploy.yml
├── turbo.json
└── pnpm-workspace.yaml
```

### 5.3 Environment Variable Strategy

| Variable | Exposed To |
|---|---|
| `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `VAPID_PUBLIC_KEY`, `R2_PUBLIC_URL` | Vercel (browser-safe) |
| `SUPABASE_SERVICE_KEY`, `DATABASE_URL`, `REDIS_URL` | Railway ONLY |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` | Railway ONLY |
| `X_API_BEARER_TOKEN`, `NEWSAPI_KEY`, `REDDIT_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY` | Railway ONLY |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `RESEND_API_KEY` | Railway ONLY |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_KEY`, `R2_BUCKET_NAME` | Railway ONLY |
| `VAPID_PRIVATE_KEY`, `SENTRY_DSN_BACKEND` | Railway ONLY |

### 5.4 CI/CD Pipeline

```
git push main → GitHub Actions:
  1. pnpm install + TypeScript check (tsc --noEmit)
  2. ESLint
  3. vitest (unit tests)
  4. pnpm build
  5a. Vercel deploy (if apps/web changed)
  5b. Railway deploy (if apps/api or apps/worker changed)
  6. scripts/migrate.ts (DB migrations via Railway)
```

### 5.5 Phase 1 Cost Estimate (~100 Active Users)

| Service | Tier | Est. Monthly |
|---|---|---|
| Vercel | Pro | $20 |
| Railway | Starter + resources (2 services) | $15 |
| Neon PostgreSQL | Free → Scale tier | $0–$19 |
| Upstash Redis | Pay-per-request | ~$5 |
| Cloudflare R2 | 10GB + CDN egress free | ~$2 |
| Supabase Auth | Free tier | $0 |
| Anthropic Claude | ~100 users × 5 pkg × $0.10/pkg | ~$50 |
| OpenAI DALL·E 3 | ~100 × 5 × 5 images × $0.04 | ~$100 |
| Perplexity API | ~100 × 5 × $0.01 | ~$5 |
| X API v2 | Basic tier | $100 |
| NewsAPI.org | Developer (free at MVP scale) | $0 |
| Resend | Free (3K emails/mo) | $0 |
| Sentry + PostHog + Uptime Robot | Free tiers | $0 |
| **Total** | | **~$297–$316/mo** |

**Key cost lever:** DALL·E 3 is the largest variable cost. Evaluate Replicate SDXL for Phase 2.

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| API + Worker as separate Railway services | Two processes | Independent scaling; worker crash doesn't affect API latency |
| Parallel stage coordination | Redis INCR on `pkg:{id}:stages_done` | Simpler than BullMQ Flow parent/child for 2-stage parallel join |
| `content_body` as JSONB | Per-format JSON in one column | Each format has a radically different structure; avoids migrations on prompt iteration |
| Supabase Auth only (not Supabase DB) | Custom Postgres on Neon/Railway | Full control, direct PgBouncer, no RLS complexity at MVP |
| Node-Cron vs. Temporal | Node-Cron + PG idempotency | Temporal adds operational overhead; `UNIQUE(user_id, run_date)` is sufficient for Phase 1 |
| `jobId: trend-${userId}-${date}` | BullMQ deduplication | Idempotent scheduler — safe to re-run if server restarts |

---

## 7. Critical Files for Implementation

These are the highest-leverage files that need to be built first and with the most care:

1. **`packages/db/schema/index.ts`** — Drizzle ORM schema mirroring the DDL; single source of truth for all table shapes imported everywhere
2. **`apps/api/src/routes/ideas.ts`** — Human checkpoint #1 gateway: `POST /ideas/:id/approve` creates `content_package` and enqueues `research-brief` job (pivot between human layer and automated pipeline)
3. **`apps/worker/src/jobs/content-drafting/index.ts`** — Most complex worker: orchestrates Claude for all 5 formats sequentially, writes drafts, triggers Redis coordination, emits WebSocket events
4. **`apps/worker/src/scheduler/index.ts`** — Per-timezone 9 PM cron; correctness critical as it drives the entire nightly pipeline for all users
5. **`packages/ai-client/index.ts`** — Anthropic SDK wrapper with prompt caching (`cache_control` on domain profile system prompt), retry logic, and per-user token budget guardrails

---

## 8. Verification Plan

| Step | How to verify |
|---|---|
| DB schema | `pnpm db:migrate` runs clean; `pnpm db:studio` shows all 13 tables with correct columns and constraints |
| API server starts | `GET /health → 200 { status: "ok" }` |
| Auth flow | Register → login → `GET /auth/me` returns user; invalid JWT → 401 |
| Domain profile upsert | PUT profile → GET returns same data |
| Scheduler fires | Manually call scheduler for a test user at current time + 1 min; verify `trend_runs` row created and `trend-harvesting` job appears in BullMQ dashboard |
| Full pipeline E2E | Seed a user with domain profile → wait for scheduled fire → approve an idea → verify `content_packages` row created → observe WebSocket `package_ready` event → verify drafts and visuals rows exist |
| Export | POST /export → verify ZIP downloads from R2 with correct structure (copy files + PNGs) |
| WebSocket | Connect with valid JWT → approve idea → observe `pipeline_stage_*` and `package_ready` events in real-time |
| Regenerate draft | POST /drafts/:id/regenerate → observe `draft_regenerated` WS event → GET draft shows version incremented |
| Failed job handling | Disable external API key → trigger pipeline → verify job moves to DLQ and `package_status = 'failed'` |
