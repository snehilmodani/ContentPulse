import { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import fp = require('fastify-plugin');
import type { Redis } from 'ioredis';
import type { JobPayload } from '@contentpulse/types';

const QUEUE_NAMES = [
  'trend-harvesting',
  'idea-generation',
  'research-brief',
  'content-drafting',
  'visual-generation',
  'export-package',
  'notification-send',
] as const;

type QueueName = (typeof QUEUE_NAMES)[number];

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400 * 7 },
  removeOnFail: false,
  attempts: 3,
};

declare module 'fastify' {
  interface FastifyInstance {
    queues: Record<QueueName, Queue<JobPayload>>;
    addJob: (queue: QueueName, payload: JobPayload, opts?: Record<string, unknown>) => Promise<void>;
  }
}

export default fp(async function queuesPlugin(
  fastify: FastifyInstance & { redis: Redis },
) {
  const connection = fastify.redis;

  const queues = Object.fromEntries(
    QUEUE_NAMES.map((name) => [
      name,
      new Queue<JobPayload>(name, {
        connection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    ]),
  ) as Record<QueueName, Queue<JobPayload>>;

  fastify.decorate('queues', queues);
  fastify.decorate('addJob', async (queue: QueueName, payload: JobPayload, opts = {}) => {
    await queues[queue].add(payload.job_type, payload, opts);
  });

  fastify.addHook('onClose', async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()));
  });
});
