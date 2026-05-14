import { z } from 'zod';

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv') as typeof import('dotenv');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  // __dirname is packages/config/src (source) or packages/config/dist (compiled); ../../.. = repo root
  dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
} catch { /* dotenv not available in production */ }

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  OPENROUTER_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),

  AI_MODEL_GENERATION: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
  AI_MODEL_RESEARCH: z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  AI_MODEL_VISUAL: z.string().default('dall-e-3'),

  X_API_BEARER_TOKEN: z.string().default(''),
  NEWSAPI_KEY: z.string().default(''),
  REDDIT_CLIENT_ID: z.string().default(''),
  REDDIT_CLIENT_SECRET: z.string().default(''),
  YOUTUBE_API_KEY: z.string().default(''),

  UNSPLASH_ACCESS_KEY: z.string().default(''),
  PEXELS_API_KEY: z.string().default(''),

  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default('contentpulse'),
  R2_PUBLIC_URL: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),

  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_EMAIL: z.string().default('mailto:hello@contentpulse.app'),

  SENTRY_DSN_BACKEND: z.string().default(''),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type WorkerEnv = z.infer<typeof schema>;

function parseWorkerEnv(): WorkerEnv {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Worker environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const workerEnv: WorkerEnv = parseWorkerEnv();
