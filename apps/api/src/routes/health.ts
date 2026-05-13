import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Db } from '@contentpulse/db';
import { sql } from 'drizzle-orm';

export async function healthRoutes(fastify: FastifyInstance & { db: Db; redis: Redis }) {
  fastify.get('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'fail' = 'fail';
    let redisStatus: 'ok' | 'fail' = 'fail';

    try {
      await fastify.db.execute(sql`SELECT 1`);
      dbStatus = 'ok';
    } catch {
      // intentional
    }

    try {
      await fastify.redis.ping();
      redisStatus = 'ok';
    } catch {
      // intentional
    }

    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      db: dbStatus,
      redis: redisStatus,
    });
  });
}
