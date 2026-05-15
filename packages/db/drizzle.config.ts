import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env so drizzle-kit picks up DATABASE_URL without manual export
config({ path: resolve(__dirname, '../../.env') });

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL is required — set it in the root .env file');
}

export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'],
  },
  verbose: true,
  strict: true,
} satisfies Config;
