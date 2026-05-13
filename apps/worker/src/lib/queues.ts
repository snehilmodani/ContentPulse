import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobPayload } from '@contentpulse/types';

export const QUEUE_NAMES = [
  'trend-harvesting',
  'idea-generation',
  'research-brief',
  'content-drafting',
  'visual-generation',
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
): Worker<JobPayload> {
  return new Worker<JobPayload>(
    name,
    async (job) => processor(job as unknown as { id?: string; data: T }),
    { connection: redis, concurrency },
  );
}
