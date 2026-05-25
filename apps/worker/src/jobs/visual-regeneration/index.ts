import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { brandKits, contentPackages, domainProfiles, ideas, trends, visuals } from '@contentpulse/db';
import type { VisualRegenerationJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import { publishToUser } from '../../lib/ws-publish';
import { DalleClient } from '../../adapters/dalle';
import { UnsplashClient, type UnsplashOrientation } from '../../adapters/unsplash';
import { buildImagePrompts } from '../visual-generation/build-image-prompts';
import { previewUrl } from '../../lib/log-utils';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  logger: Logger;
  uploadToR2: (key: string, url: string, userId: string) => Promise<string>;
  env: { OPENROUTER_API_KEY: string; UNSPLASH_ACCESS_KEY: string; AI_MODEL_VISUAL: string };
}

const UNSPLASH_ORIENTATION: Record<string, UnsplashOrientation> = {
  thumbnail:      'landscape',
  square_post:    'squarish',
  story_cover:    'portrait',
  carousel_slide: 'squarish',
  x_header:       'landscape',
};

export async function processVisualRegeneration(
  payload: VisualRegenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, aiClient, logger, uploadToR2, env } = deps;
  const { user_id, visual_id, content_package_id, instruction, override_method } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, instruction, overrideMethod: override_method ?? null }, 'visual-regeneration started');

  const [visual] = await db.select().from(visuals).where(eq(visuals.id, visual_id)).limit(1);
  if (!visual) {
    logger.error({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id }, 'Visual not found in DB');
    throw new Error(`Visual ${visual_id} not found`);
  }

  const method = override_method ?? visual.generationMethod;
  logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, visualType: visual.visualType, currentVersion: visual.version, resolvedMethod: method }, 'Visual fetched from DB');

  try {
    let imageUrl: string;
    let promptUsed: string;
    let widthPx: number;
    let heightPx: number;

    // Resolve the prompt: user instruction takes precedence; otherwise call Claude with full context.
    let dallePrompt: string | undefined;
    let unsplashQuery: string | undefined;

    if (!instruction) {
      logger.debug({ userId: user_id, visualId: visual_id, visualType: visual.visualType }, 'No instruction provided — fetching context for Claude prompt generation');

      const [pkg] = await db.select().from(contentPackages).where(eq(contentPackages.id, content_package_id)).limit(1);
      if (pkg) {
        logger.debug({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, ideaId: pkg.ideaId }, 'Content package loaded from DB');
      } else {
        logger.warn({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id }, 'Content package not found in DB — will use fallback prompt');
      }

      const [idea] = pkg ? await db.select().from(ideas).where(eq(ideas.id, pkg.ideaId)).limit(1) : [undefined];
      if (idea) {
        logger.debug({ userId: user_id, visualId: visual_id, ideaId: idea.id, hookLine: idea.hookLine, trendId: idea.trendId }, 'Idea loaded from DB');
      } else {
        logger.warn({ userId: user_id, visualId: visual_id }, 'Idea not found in DB — will use fallback prompt');
      }

      const [trend] = idea ? await db.select().from(trends).where(eq(trends.id, idea.trendId)).limit(1) : [undefined];
      if (trend) {
        logger.debug({ userId: user_id, visualId: visual_id, trendId: trend.id, topicName: trend.topicName }, 'Trend loaded from DB');
      } else {
        logger.debug({ userId: user_id, visualId: visual_id }, 'Trend not found — prompts will be built without trend context');
      }

      const [profile] = await db.select().from(domainProfiles).where(eq(domainProfiles.userId, user_id)).limit(1);
      logger.debug({ userId: user_id, visualId: visual_id, profileFound: !!profile, toneOfVoice: profile?.toneOfVoice ?? [] }, 'Domain profile lookup complete');

      const [brandKit] = await db.select().from(brandKits).where(eq(brandKits.userId, user_id)).limit(1);
      logger.debug({ userId: user_id, visualId: visual_id, brandKitFound: !!brandKit, primaryColors: brandKit?.primaryColors ?? [], brandingMode: brandKit?.brandingMode ?? 'flexible' }, 'Brand kit lookup complete');

      if (idea) {
        const promptMap = await buildImagePrompts({
          visualTypes: [visual.visualType],
          idea: { hookLine: idea.hookLine, coreArgument: idea.coreArgument },
          ...(trend?.topicName ? { trendTopicName: trend.topicName } : {}),
          brandKit: {
            primaryColors: brandKit?.primaryColors ?? [],
            brandingMode: brandKit?.brandingMode ?? 'flexible',
          },
          ...(profile ? { domainProfile: { creatorPersona: profile.creatorPersona, toneOfVoice: profile.toneOfVoice } } : {}),
          userId: user_id,
          aiClient,
          logger,
        });
        const prompts = promptMap.get(visual.visualType);
        dallePrompt = prompts?.dallePrompt;
        unsplashQuery = prompts?.unsplashQuery;
        logger.debug({ userId: user_id, visualId: visual_id, visualType: visual.visualType, dallePrompt, unsplashQuery }, 'Prompts built via Claude for regen');
      }
    } else {
      logger.debug({ userId: user_id, visualId: visual_id, visualType: visual.visualType, instruction }, 'Using user-provided instruction directly as prompt');
    }

    if (method === 'ai_dalle') {
      const dalleClient = new DalleClient(env.OPENROUTER_API_KEY, env.AI_MODEL_VISUAL, logger);
      const prompt = instruction ?? dallePrompt ?? `Professional image for ${visual.visualType}`;
      logger.info({ userId: user_id, visualId: visual_id, visualType: visual.visualType, prompt }, 'Calling DALL-E for visual regeneration');
      const result = await dalleClient.generate(prompt, visual.visualType);
      imageUrl = result.url;
      promptUsed = result.revisedPrompt;
      widthPx = result.widthPx;
      heightPx = result.heightPx;
      logger.debug({ userId: user_id, visualId: visual_id, revisedPrompt: result.revisedPrompt, widthPx, heightPx }, 'DALL-E image generated');
    } else {
      const unsplashClient = new UnsplashClient(env.UNSPLASH_ACCESS_KEY, logger);
      const query = instruction ?? unsplashQuery ?? visual.visualType;
      const orientation = UNSPLASH_ORIENTATION[visual.visualType] ?? 'squarish';
      logger.info({ userId: user_id, visualId: visual_id, visualType: visual.visualType, query, orientation }, 'Querying Unsplash for visual regeneration');
      const result = await unsplashClient.search(query, orientation);
      imageUrl = result.url;
      promptUsed = query;
      widthPx = result.widthPx;
      heightPx = result.heightPx;
      logger.debug({ userId: user_id, visualId: visual_id, imageUrl: previewUrl(imageUrl), widthPx, heightPx }, 'Unsplash image fetched');
    }

    const key = `visuals/${user_id}/${content_package_id}/${visual.visualType}-v${visual.version + 1}-${Date.now()}.jpg`;
    let cdnUrl: string;
    logger.debug({ userId: user_id, visualId: visual_id, r2Key: key }, 'Uploading regenerated visual to R2');
    try {
      cdnUrl = await uploadToR2(key, imageUrl, user_id);
      logger.debug({ userId: user_id, visualId: visual_id, r2Key: key }, 'R2 upload succeeded');
    } catch (uploadErr) {
      logger.warn({ err: uploadErr, userId: user_id, visualId: visual_id, contentPackageId: content_package_id }, 'R2 upload failed — using source URL as cdnUrl');
      cdnUrl = imageUrl;
    }

    await db
      .update(visuals)
      .set({
        status: 'ready',
        r2Key: key,
        cdnUrl,
        promptUsed,
        sourceUrl: imageUrl,
        generationMethod: method as 'ai_dalle' | 'web_unsplash',
        widthPx,
        heightPx,
        version: visual.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(visuals.id, visual_id));

    logger.debug({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, r2Key: key, cdnUrl, promptUsed, widthPx, heightPx, newVersion: visual.version + 1 }, 'Visual DB row updated');
    logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, newVersion: visual.version + 1, method, r2Key: key, cdnUrl, widthPx, heightPx, duration_ms: Date.now() - startMs }, 'visual-regeneration complete');

    logger.debug({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, newVersion: visual.version + 1 }, 'Publishing visual_regenerated via WebSocket');
    await publishToUser(redis, user_id, {
      event: 'visual_regenerated',
      data: { visual_id, content_package_id, version: visual.version + 1 },
      timestamp: new Date().toISOString(),
    });
    logger.debug({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id }, 'visual_regenerated published');
  } catch (err) {
    logger.error({ err, userId: user_id, visualId: visual_id, contentPackageId: content_package_id, method, duration_ms: Date.now() - startMs }, 'Visual regeneration failed — resetting status to ready');
    await db.update(visuals).set({ status: 'ready', updatedAt: new Date() }).where(eq(visuals.id, visual_id));
    throw err;
  }
}
