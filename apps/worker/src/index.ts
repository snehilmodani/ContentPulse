import pino from 'pino';
import IORedis from 'ioredis';
import { workerEnv } from '@contentpulse/config';
import { getDb } from '@contentpulse/db';
import { AnthropicClient } from '@contentpulse/ai-client';
import { createQueues, createWorker } from './lib/queues';
import { startScheduler } from './scheduler';
import { processTrendHarvesting } from './jobs/trend-harvesting';
import { processIdeaGeneration } from './jobs/idea-generation';
import { processResearchBrief } from './jobs/research-brief';
import { processContentDrafting } from './jobs/content-drafting';
import { processVisualGeneration } from './jobs/visual-generation';
import { processExportPackage } from './jobs/export-package';
import { processNotificationSend } from './jobs/notification-send';
import { processDraftRegeneration } from './jobs/draft-regeneration';
import { processVisualRegeneration } from './jobs/visual-regeneration';
import { ResendClient } from './adapters/resend';
import { R2StorageClient } from './lib/r2';
import type {
  TrendHarvestingJobPayload,
  IdeaGenerationJobPayload,
  ResearchBriefJobPayload,
  ContentDraftingJobPayload,
  VisualGenerationJobPayload,
  ExportPackageJobPayload,
  NotificationSendJobPayload,
  DraftRegenerationJobPayload,
  VisualRegenerationJobPayload,
} from '@contentpulse/types';

const logger = pino({ level: workerEnv.LOG_LEVEL });
const db = getDb(workerEnv.DATABASE_URL);
const redis = new IORedis(workerEnv.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(redis);
const aiClient = new AnthropicClient(workerEnv.OPENROUTER_API_KEY, redis, workerEnv.AI_MODEL_GENERATION);
const resend = new ResendClient(workerEnv.RESEND_API_KEY);
const r2 = new R2StorageClient({
  accountId: workerEnv.R2_ACCOUNT_ID,
  accessKeyId: workerEnv.R2_ACCESS_KEY_ID,
  secretKey: workerEnv.R2_SECRET_KEY,
  bucketName: workerEnv.R2_BUCKET_NAME,
  publicUrl: workerEnv.R2_PUBLIC_URL,
});

const workers = [
  createWorker<TrendHarvestingJobPayload>('trend-harvesting', redis, 5, (job) =>
    processTrendHarvesting(job.data, { db, redis, aiClient, queues, logger, env: workerEnv }),
  ),

  createWorker<IdeaGenerationJobPayload>('idea-generation', redis, 10, (job) =>
    processIdeaGeneration(job.data, { db, redis, aiClient, queues, logger }),
  ),

  createWorker<ResearchBriefJobPayload>('research-brief', redis, 5, (job) =>
    processResearchBrief(job.data, { db, redis, queues, logger, env: workerEnv }),
  ),

  createWorker<ContentDraftingJobPayload>('content-drafting', redis, 5, (job) =>
    processContentDrafting(job.data, { db, redis, aiClient, queues, logger }),
  ),

  createWorker<VisualGenerationJobPayload>('visual-generation', redis, 10, (job) =>
    processVisualGeneration(job.data, {
      db,
      redis,
      queues,
      logger,
      env: workerEnv,
      uploadToR2: async (key, url) => {
        const resp = await fetch(url);
        const buf = Buffer.from(await resp.arrayBuffer());
        return r2.upload(key, buf, 'image/jpeg');
      },
    }),
  ),

  createWorker<ExportPackageJobPayload>('export-package', redis, 10, (job) =>
    processExportPackage(job.data, {
      db,
      redis,
      queues,
      logger,
      uploadZipToR2: (key, buf) => r2.upload(key, buf, 'application/zip'),
      getSignedUrl: (key) => r2.getSignedDownloadUrl(key, 86400),
    }),
  ),

  createWorker<NotificationSendJobPayload>('notification-send', redis, 20, (job) =>
    processNotificationSend(job.data, { db, logger, resend }),
  ),

  createWorker<DraftRegenerationJobPayload>('draft-regeneration', redis, 5, (job) =>
    processDraftRegeneration(job.data, { db, redis, aiClient, logger }),
  ),

  createWorker<VisualRegenerationJobPayload>('visual-regeneration', redis, 5, (job) =>
    processVisualRegeneration(job.data, {
      db,
      redis,
      logger,
      env: workerEnv,
      uploadToR2: async (key, url) => {
        const resp = await fetch(url);
        const buf = Buffer.from(await resp.arrayBuffer());
        return r2.upload(key, buf, 'image/jpeg');
      },
    }),
  ),
];

const scheduler = startScheduler({ db, queues, logger });

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });
}

logger.info('Worker process started');

async function shutdown() {
  logger.info('Shutting down worker...');
  scheduler.stop();

  // Give active jobs up to 10 s to finish; after that exit anyway so tsx watch
  // doesn't escalate to SIGKILL (which would leave jobs with a stall count).
  const drainTimeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      logger.warn('Shutdown drain timeout reached — forcing close');
      resolve();
    }, 10_000).unref(),
  );
  await Promise.race([Promise.all(workers.map((w) => w.close())), drainTimeout]);

  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
