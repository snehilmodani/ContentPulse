import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// __dirname is packages/config/src (source) or packages/config/dist (compiled); ../../.. = repo root
try { dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') }); } catch { /* .env absent in production — env vars pre-set by hosting */ }

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),
  AI_MODEL_GENERATION: z.string().default(''),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default('contentpulse'),
  R2_PUBLIC_URL: z.string().default(''),
  LOCAL_STORAGE_PATH: z.string().default(path.resolve(__dirname, '../../..', 'tmp', 'r2')),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default('http://localhost:3001/r2'),

  RESEND_API_KEY: z.string().default(''),

  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_EMAIL: z.string().default('mailto:hello@contentpulse.app'),

  SENTRY_DSN_BACKEND: z.string().default(''),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ApiEnv = z.infer<typeof schema>;

function parseApiEnv(): ApiEnv {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] API environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const apiEnv: ApiEnv = parseApiEnv();
