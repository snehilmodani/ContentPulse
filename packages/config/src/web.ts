import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001/v1'),
  NEXT_PUBLIC_WS_URL: z.string().default('ws://localhost:3001/v1/ws'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type WebEnv = z.infer<typeof schema>;

function parseWebEnv(): WebEnv {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Web environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const webEnv: WebEnv = parseWebEnv();
