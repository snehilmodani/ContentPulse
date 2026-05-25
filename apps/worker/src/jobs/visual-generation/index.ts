import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { contentPackages, domainProfiles, ideas, notifications, trends, visuals } from '@contentpulse/db';
import type { VisualGenerationJobPayload, VisualType } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';
import { incrStagesDone } from '../../lib/redis-coord';
import { DalleClient, getDimensions } from '../../adapters/dalle';
import { UnsplashClient, type UnsplashOrientation } from '../../adapters/unsplash';
import { buildImagePrompts } from './build-image-prompts';
import { previewUrl } from '../../lib/log-utils';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
  uploadToR2: (key: string, url: string, userId: string) => Promise<string>;
  env: { OPENROUTER_API_KEY: string; UNSPLASH_ACCESS_KEY: string; AI_MODEL_VISUAL: string; BYPASS_VISUAL_GENERATION: string };
}

const AI_VISUAL_TYPES: VisualType[] = ['thumbnail'];

const UNSPLASH_ORIENTATION: Record<VisualType, UnsplashOrientation> = {
  thumbnail:      'landscape',
  square_post:    'squarish',
  story_cover:    'portrait',
  carousel_slide: 'squarish',
  x_header:       'landscape',
};

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function processVisualGeneration(
  payload: VisualGenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, aiClient, queues, logger, uploadToR2, env } = deps;
  const { user_id, content_package_id, idea_id, visual_types } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, contentPackageId: content_package_id, visualTypes: visual_types, bypassVisual: env.BYPASS_VISUAL_GENERATION }, 'visual-generation started');

  logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'Publishing pipeline_stage_started via WebSocket');
  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { content_package_id, stage: 'visual-generation' },
    timestamp: new Date().toISOString(),
  });
  logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'pipeline_stage_started published');

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
    // Fetch context needed for prompt construction
    const [idea] = await db.select().from(ideas).where(eq(ideas.id, idea_id)).limit(1);
    if (!idea) {
      logger.error({ userId: user_id, contentPackageId: content_package_id, ideaId: idea_id }, 'Idea not found in DB — cannot build image prompts');
      throw new Error(`Idea ${idea_id} not found`);
    }
    logger.debug({ userId: user_id, contentPackageId: content_package_id, ideaId: idea_id, hookLine: idea.hookLine, trendId: idea.trendId }, 'Idea loaded from DB');

    const [trend] = await db.select().from(trends).where(eq(trends.id, idea.trendId)).limit(1);
    if (trend) {
      logger.debug({ userId: user_id, contentPackageId: content_package_id, trendId: trend.id, topicName: trend.topicName }, 'Trend loaded from DB');
    } else {
      logger.warn({ userId: user_id, contentPackageId: content_package_id, trendId: idea.trendId }, 'Trend not found in DB — prompts will be built without trend context');
    }

    const [profile] = await db.select().from(domainProfiles).where(eq(domainProfiles.userId, user_id)).limit(1);
    if (profile) {
      logger.debug({ userId: user_id, contentPackageId: content_package_id, toneOfVoice: profile.toneOfVoice, hasPersona: !!profile.creatorPersona }, 'Domain profile loaded from DB');
    } else {
      logger.warn({ userId: user_id, contentPackageId: content_package_id }, 'Domain profile not found — prompts will be built without tone/persona context');
    }

    logger.debug({ userId: user_id, contentPackageId: content_package_id, brandColors: payload.brand_kit.primary_colors, brandingMode: payload.brand_kit.branding_mode }, 'Brand kit from payload');

    const promptMap = await buildImagePrompts({
      visualTypes: visual_types,
      idea: { hookLine: idea.hookLine, coreArgument: idea.coreArgument },
      ...(trend?.topicName ? { trendTopicName: trend.topicName } : {}),
      brandKit: {
        primaryColors: payload.brand_kit.primary_colors,
        brandingMode: payload.brand_kit.branding_mode,
      },
      ...(profile ? { domainProfile: { creatorPersona: profile.creatorPersona, toneOfVoice: profile.toneOfVoice } } : {}),
      userId: user_id,
      aiClient,
      logger,
    });

    logger.debug(
      { userId: user_id, contentPackageId: content_package_id, prompts: Object.fromEntries(promptMap) },
      'Image prompts ready',
    );

    const dalleClient = new DalleClient(env.OPENROUTER_API_KEY, env.AI_MODEL_VISUAL, logger);
    const unsplashClient = new UnsplashClient(env.UNSPLASH_ACCESS_KEY, logger);

    let succeeded = 0;
    let failed = 0;

    for (const visualType of visual_types) {
      const useAi = AI_VISUAL_TYPES.includes(visualType);
      const prompts = promptMap.get(visualType)!;
      const visualStart = Date.now();

      logger.info({ userId: user_id, contentPackageId: content_package_id, visualType, method: useAi ? 'ai_dalle' : 'web_unsplash' }, 'Generating visual');

      try {
        let imageUrl: string;
        let method: 'ai_dalle' | 'web_unsplash';
        let promptUsed: string;
        let widthPx: number;
        let heightPx: number;

        if (useAi) {
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, dallePrompt: prompts.dallePrompt }, 'Sending prompt to DALL-E');
          const result = await dalleClient.generate(prompts.dallePrompt, visualType);
          imageUrl = result.url;
          method = 'ai_dalle';
          promptUsed = result.revisedPrompt;
          widthPx = result.widthPx;
          heightPx = result.heightPx;
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, revisedPrompt: result.revisedPrompt, widthPx, heightPx }, 'DALL-E image generated');
        } else {
          const orientation = UNSPLASH_ORIENTATION[visualType] ?? 'squarish';
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, unsplashQuery: prompts.unsplashQuery, orientation }, 'Sending query to Unsplash');
          const result = await unsplashClient.search(prompts.unsplashQuery, orientation);
          imageUrl = result.url;
          method = 'web_unsplash';
          promptUsed = prompts.unsplashQuery;
          widthPx = result.widthPx;
          heightPx = result.heightPx;
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, imageUrl: previewUrl(imageUrl), widthPx, heightPx }, 'Unsplash image fetched');
        }

        const key = `visuals/${user_id}/${content_package_id}/${visualType}-${Date.now()}.jpg`;
        let cdnUrl: string;

        try {
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, imageUrl: previewUrl(imageUrl) }, 'Fetching image buffer from provider URL');
          const buffer = await fetchImageBuffer(imageUrl);
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, bufferBytes: buffer.length, r2Key: key }, 'Image buffer fetched — uploading to R2');
          cdnUrl = await uploadToR2(key, imageUrl, user_id);
          void buffer;
          logger.debug({ userId: user_id, contentPackageId: content_package_id, visualType, r2Key: key, cdnUrl }, 'Visual uploaded to R2');
        } catch (uploadErr) {
          logger.warn({ uploadErr, userId: user_id, contentPackageId: content_package_id, visualType }, 'R2 upload failed — falling back to source URL as cdnUrl');
          cdnUrl = imageUrl;
        }

        await db.insert(visuals).values({
          contentPackageId: content_package_id,
          userId: user_id,
          visualType,
          widthPx,
          heightPx,
          generationMethod: method,
          status: 'ready',
          r2Key: key,
          cdnUrl,
          promptUsed,
          sourceUrl: imageUrl,
        });

        succeeded++;
        logger.info({ userId: user_id, contentPackageId: content_package_id, visualType, method, r2Key: key, cdnUrl, widthPx, heightPx, duration_ms: Date.now() - visualStart }, 'Visual inserted as ready');
      } catch (err) {
        failed++;
        logger.error({ err, userId: user_id, contentPackageId: content_package_id, visualType, duration_ms: Date.now() - visualStart }, 'Visual generation failed — skipping placeholder insert');
      }
    }

    logger.info({ userId: user_id, contentPackageId: content_package_id, succeeded, failed, total: visual_types.length, duration_ms: Date.now() - startMs }, 'Visual generation batch complete');
  }

  logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'Publishing pipeline_stage_completed via WebSocket');
  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { content_package_id, stage: 'visual-generation', duration_ms: Date.now() - startMs },
    timestamp: new Date().toISOString(),
  });
  logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'pipeline_stage_completed published');

  const stagesDone = await incrStagesDone(redis, content_package_id);
  logger.info({ userId: user_id, contentPackageId: content_package_id, stagesDone }, 'Redis coordination counter after visual-generation');

  if (stagesDone >= 2) {
    logger.info({ userId: user_id, contentPackageId: content_package_id }, 'Both drafting and visual stages done — marking package ready');

    const visualRows = await db
      .select()
      .from(visuals)
      .where(eq(visuals.contentPackageId, content_package_id));

    logger.debug({ userId: user_id, contentPackageId: content_package_id, visualCount: visualRows.length }, 'Publishing package_ready via WebSocket');
    await publishToUser(redis, user_id, {
      event: 'package_ready',
      data: { content_package_id, draft_count: 0, visual_count: visualRows.length },
      timestamp: new Date().toISOString(),
    });
    logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'package_ready published');

    await db
      .update(contentPackages)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(contentPackages.id, content_package_id));
    logger.debug({ userId: user_id, contentPackageId: content_package_id }, 'Content package status set to ready');

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
