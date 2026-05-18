import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { JobPayload } from '@contentpulse/types';

export const QUEUE_NAMES = [
  'trend-harvesting',
  'idea-generation',
  'research-brief',
  'content-drafting',
  'draft-regeneration',
  'visual-generation',
  'visual-regeneration',
  'export-package',
  'notification-send',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400 * 7 },
  removeOnFail: false,
  attempts: 3,
} as const;

export function createQueues(redis: Redis): Record<QueueName, Queue<JobPayload>> {
  return Object.fromEntries(
    QUEUE_NAMES.map((name) => [
      name,
      new Queue<JobPayload>(name, {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    ]),
  ) as Record<QueueName, Queue<JobPayload>>;
}

export function createWorker<T extends JobPayload>(
  name: QueueName,
  redis: Redis,
  concurrency: number,
  processor: (job: { id?: string; data: T }) => Promise<void>,
  logger: Logger,
): Worker<JobPayload> {
  const worker = new Worker<JobPayload>(
    name,
    async (job) => {
      const start = Date.now();
      logger.info({ queue: name, jobId: job.id, data: job.data }, 'job picked up');
      await processor(job as unknown as { id?: string; data: T });
      logger.info({ queue: name, jobId: job.id, duration_ms: Date.now() - start }, 'job completed');
    },
    { connection: redis, concurrency, lockDuration: 120_000, maxStalledCount: 3 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, err }, 'job failed');
  });

  return worker;
}
