import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { contentPackages, notifications, visuals } from '@contentpulse/db';
import type { VisualGenerationJobPayload, VisualType } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';
import { incrStagesDone } from '../../lib/redis-coord';
import { DalleClient, getDimensions } from '../../adapters/dalle';
import { UnsplashClient } from '../../adapters/unsplash';

interface Deps {
  db: Db;
  redis: Redis;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
  uploadToR2: (key: string, url: string, userId: string) => Promise<string>;
  env: { OPENAI_API_KEY: string; UNSPLASH_ACCESS_KEY: string; AI_MODEL_VISUAL: string; BYPASS_VISUAL_GENERATION: string };
}

const AI_VISUAL_TYPES: VisualType[] = ['thumbnail'];

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function processVisualGeneration(
  payload: VisualGenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, queues, logger, uploadToR2, env } = deps;
  const { user_id, content_package_id, visual_types } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, contentPackageId: content_package_id, visualTypes: visual_types, trendCategory: payload.trend_category, bypassVisual: env.BYPASS_VISUAL_GENERATION }, 'visual-generation started');

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { content_package_id, stage: 'visual-generation' },
    timestamp: new Date().toISOString(),
  });

  if (env.BYPASS_VISUAL_GENERATION === 'true') {
    logger.info({ userId: user_id, contentPackageId: content_package_id, visualTypes: visual_types }, 'BYPASS_VISUAL_GENERATION=true — inserting picsum placeholder images');
    await Promise.all(
      visual_types.map(async (visualType) => {
        const dims = getDimensions(visualType);
        const seed = `${payload.trend_category}-${visualType}`;
        const cdnUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${dims.width}/${dims.height}`;
        const key = `visuals/${user_id}/${content_package_id}/${visualType}-bypass.jpg`;
        await db.insert(visuals).values({
          contentPackageId: content_package_id,
          userId: user_id,
          visualType,
          widthPx: dims.width,
          heightPx: dims.height,
          generationMethod: 'web_unsplash',
          status: 'ready',
          r2Key: key,
          cdnUrl,
          promptUsed: `[bypass] ${payload.trend_category}`,
          sourceUrl: cdnUrl,
        });
        logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, cdnUrl, dims }, 'Bypass visual inserted');
      }),
    );
  } else {
    const dalleClient = new DalleClient(env.OPENAI_API_KEY, env.AI_MODEL_VISUAL);
    const unsplashClient = new UnsplashClient(env.UNSPLASH_ACCESS_KEY);

    const results = await Promise.allSettled(
      visual_types.map(async (visualType) => {
        const dims = getDimensions(visualType);
        const useAi = AI_VISUAL_TYPES.includes(visualType);
        const visualStart = Date.now();

        logger.info({ userId: user_id, contentPackageId: content_package_id, visualType, method: useAi ? 'ai_dalle' : 'web_unsplash', dims }, 'Generating visual');

        try {
          let imageUrl: string;
          let method: 'ai_dalle' | 'web_unsplash';
          let promptUsed: string;

          if (useAi) {
            const prompt = `Professional content thumbnail for "${payload.trend_category}" topic, modern design, high quality`;
            const result = await dalleClient.generate(prompt, visualType);
            imageUrl = result.url;
            method = 'ai_dalle';
            promptUsed = result.revisedPrompt;
            logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, revisedPrompt: result.revisedPrompt }, 'DALL-E image generated');
          } else {
            const result = await unsplashClient.search(payload.trend_category);
            imageUrl = result.url;
            method = 'web_unsplash';
            promptUsed = payload.trend_category;
            logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, imageUrl }, 'Unsplash image fetched');
          }

          const key = `visuals/${user_id}/${content_package_id}/${visualType}-${Date.now()}.jpg`;
          let cdnUrl: string;

          try {
            const buffer = await fetchImageBuffer(imageUrl);
            cdnUrl = await uploadToR2(key, imageUrl, user_id);
            void buffer;
            logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, r2Key: key }, 'Visual uploaded to R2');
          } catch (uploadErr) {
            logger.warn({ uploadErr, userId: user_id, contentPackageId: content_package_id, visualType }, 'R2 upload failed — falling back to source URL as cdnUrl');
            cdnUrl = imageUrl;
          }

          await db.insert(visuals).values({
            contentPackageId: content_package_id,
            userId: user_id,
            visualType,
            widthPx: dims.width,
            heightPx: dims.height,
            generationMethod: method,
            status: 'ready',
            r2Key: key,
            cdnUrl,
            promptUsed,
            sourceUrl: imageUrl,
          });

          logger.info({ userId: user_id, contentPackageId: content_package_id, visualType, method, r2Key: key, duration_ms: Date.now() - visualStart }, 'Visual inserted as ready');
        } catch (err) {
          logger.error({ err, userId: user_id, contentPackageId: content_package_id, visualType, duration_ms: Date.now() - visualStart }, 'Visual generation failed — inserting placeholder with generating status');
          await db.insert(visuals).values({
            contentPackageId: content_package_id,
            userId: user_id,
            visualType,
            widthPx: dims.width,
            heightPx: dims.height,
            generationMethod: 'ai_dalle',
            status: 'generating',
          });
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    logger.info({ userId: user_id, contentPackageId: content_package_id, succeeded, failed, total: visual_types.length, duration_ms: Date.now() - startMs }, 'Visual generation batch complete');
  }

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { content_package_id, stage: 'visual-generation', duration_ms: Date.now() - startMs },
    timestamp: new Date().toISOString(),
  });

  const stagesDone = await incrStagesDone(redis, content_package_id);
  logger.info({ userId: user_id, contentPackageId: content_package_id, stagesDone }, 'Redis coordination counter after visual-generation');

  if (stagesDone >= 2) {
    logger.info({ userId: user_id, contentPackageId: content_package_id }, 'Both drafting and visual stages done — marking package ready');

    const visualRows = await db
      .select()
      .from(visuals)
      .where(eq(visuals.contentPackageId, content_package_id));

    await publishToUser(redis, user_id, {
      event: 'package_ready',
      data: { content_package_id, draft_count: 0, visual_count: visualRows.length },
      timestamp: new Date().toISOString(),
    });

    await db
      .update(contentPackages)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(contentPackages.id, content_package_id));

    const [notif] = await db
      .insert(notifications)
      .values({
        userId: user_id,
        event: 'package_ready',
        channel: 'push',
        title: 'Your content package is ready',
        body: 'Visuals and drafts are ready for review.',
        payload: { content_package_id },
      })
      .returning();

    if (notif) {
      logger.info({ userId: user_id, contentPackageId: content_package_id, notificationId: notif.id }, 'Enqueueing package_ready notification');
      await queues['notification-send']?.add('notification_send', {
        job_type: 'notification_send',
        user_id,
        notification_id: notif.id,
        event: 'package_ready',
        channels: ['push'],
        template_data: { content_package_id },
      });
    } else {
      logger.warn({ userId: user_id, contentPackageId: content_package_id }, 'package_ready notification insert returned no row — push will not be sent');
    }
  } else {
    logger.debug({ userId: user_id, contentPackageId: content_package_id, stagesDone }, 'Waiting for content-drafting to complete before marking package ready');
  }
}
