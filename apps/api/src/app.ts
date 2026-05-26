import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import type { ApiEnv } from '@contentpulse/config';
import { getDb } from '@contentpulse/db';
import { AnthropicClient } from '@contentpulse/ai-client';
import { errorHandler } from './lib/errors';
import { R2StorageClient } from './lib/r2';
import authPlugin from './plugins/auth';
import queuesPlugin from './plugins/queues';
import { authRoutes } from './routes/auth';
import { draftRoutes } from './routes/drafts';
import { healthRoutes } from './routes/health';
import { ideaRoutes } from './routes/ideas';
import { notificationRoutes } from './routes/notifications';
import { packageRoutes } from './routes/packages';
import { trendRoutes } from './routes/trends';
import { userRoutes } from './routes/users';
import { visualRoutes } from './routes/visuals';
import { registerWebSocket } from './ws';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>;
    redis: Redis;
    r2: R2StorageClient;
    aiClient: AnthropicClient;
  }
}

export async function buildApp(env: ApiEnv) {
  const fastify = Fastify({
    logger:
      env.NODE_ENV !== 'production'
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { colorize: true, sync: true } } }
        : { level: env.LOG_LEVEL },
  });

  // core plugins
  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(jwt, { secret: env.JWT_SECRET });
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await fastify.register(websocket);

  // infra decorators
  const db = getDb(env.DATABASE_URL);
  fastify.decorate('db', db);

  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  fastify.decorate('redis', redis);

  const r2 = new R2StorageClient({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretKey: env.R2_SECRET_KEY,
    bucketName: env.R2_BUCKET_NAME,
    publicUrl: env.R2_PUBLIC_URL,
    localRoot: env.LOCAL_STORAGE_PATH,
    localPublicUrl: env.LOCAL_STORAGE_PUBLIC_URL,
  });
  fastify.decorate('r2', r2);

  const aiClient = new AnthropicClient(env.OPENROUTER_API_KEY, redis, env.AI_MODEL_GENERATION || undefined);
  fastify.decorate('aiClient', aiClient);

  if (!env.R2_ACCOUNT_ID) {
    fastify.get('/r2/*', async (req, reply) => {
      const key = (req.params as { '*': string })['*'];
      const filePath = path.join(env.LOCAL_STORAGE_PATH, key);
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'not found' });
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return reply.type(mime).send(fs.createReadStream(filePath));
    });
  }

  fastify.addHook('onClose', async () => {
    redis.disconnect();
  });

  // custom plugins
  await fastify.register(authPlugin);
  await fastify.register(queuesPlugin);

  fastify.setErrorHandler(errorHandler);

  // health sits outside /v1
  await healthRoutes(fastify);

  // rest under /v1
  await fastify.register(
    async (v1) => {
      const inst = v1 as typeof fastify;
      await authRoutes(inst);
      await userRoutes(inst);
      await trendRoutes(inst);
      await ideaRoutes(inst);
      await packageRoutes(inst);
      await draftRoutes(inst);
      await visualRoutes(inst);
      await notificationRoutes(inst);
    },
    { prefix: '/v1' },
  );

  // WebSocket (registered at root so it can access /v1/ws)
  await registerWebSocket(fastify as typeof fastify & { redis: Redis });

  return fastify;
}
