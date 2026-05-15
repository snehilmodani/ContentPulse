import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { visuals } from '@contentpulse/db';
import type { VisualRegenerationJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import { publishToUser } from '../../lib/ws-publish';
import { DalleClient } from '../../adapters/dalle';
import { UnsplashClient } from '../../adapters/unsplash';

interface Deps {
  db: Db;
  redis: Redis;
  logger: Logger;
  uploadToR2: (key: string, url: string, userId: string) => Promise<string>;
  env: { OPENAI_API_KEY: string; UNSPLASH_ACCESS_KEY: string; AI_MODEL_VISUAL: string };
}

export async function processVisualRegeneration(
  payload: VisualRegenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, logger, uploadToR2, env } = deps;
  const { user_id, visual_id, content_package_id, instruction, override_method } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, instruction, overrideMethod: override_method ?? null }, 'visual-regeneration started');

  const [visual] = await db.select().from(visuals).where(eq(visuals.id, visual_id)).limit(1);
  if (!visual) {
    logger.error({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id }, 'Visual not found in DB');
    throw new Error(`Visual ${visual_id} not found`);
  }

  const method = override_method ?? visual.generationMethod;
  logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, visualType: visual.visualType, currentVersion: visual.version, currentMethod: visual.generationMethod, resolvedMethod: method }, 'Visual fetched from DB');

  try {
    let imageUrl: string;
    let promptUsed: string;

    if (method === 'ai_dalle') {
      const dalleClient = new DalleClient(env.OPENAI_API_KEY, env.AI_MODEL_VISUAL);
      const prompt = instruction ?? `Professional image for ${visual.visualType}`;
      logger.info({ userId: user_id, visualId: visual_id, visualType: visual.visualType, prompt }, 'Calling DALL-E for visual regeneration');
      const result = await dalleClient.generate(prompt, visual.visualType);
      imageUrl = result.url;
      promptUsed = result.revisedPrompt;
      logger.debug({ userId: user_id, visualId: visual_id, revisedPrompt: result.revisedPrompt }, 'DALL-E image generated');
    } else {
      const unsplashClient = new UnsplashClient(env.UNSPLASH_ACCESS_KEY);
      const query = instruction ?? visual.visualType;
      logger.info({ userId: user_id, visualId: visual_id, visualType: visual.visualType, query }, 'Querying Unsplash for visual regeneration');
      const result = await unsplashClient.search(query);
      imageUrl = result.url;
      promptUsed = query;
      logger.debug({ userId: user_id, visualId: visual_id, imageUrl }, 'Unsplash image fetched');
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
        version: visual.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(visuals.id, visual_id));

    logger.info({ userId: user_id, visualId: visual_id, contentPackageId: content_package_id, newVersion: visual.version + 1, method, r2Key: key, duration_ms: Date.now() - startMs }, 'visual-regeneration complete');

    await publishToUser(redis, user_id, {
      event: 'visual_regenerated',
      data: { visual_id, content_package_id, version: visual.version + 1 },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId: user_id, visualId: visual_id, contentPackageId: content_package_id, method, duration_ms: Date.now() - startMs }, 'Visual regeneration failed — resetting status to ready');
    await db.update(visuals).set({ status: 'ready', updatedAt: new Date() }).where(eq(visuals.id, visual_id));
    throw err;
  }
}
