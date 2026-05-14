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

  const [visual] = await db.select().from(visuals).where(eq(visuals.id, visual_id)).limit(1);
  if (!visual) throw new Error(`Visual ${visual_id} not found`);

  const method = override_method ?? visual.generationMethod;

  try {
    let imageUrl: string;
    let promptUsed: string;

    if (method === 'ai_dalle') {
      const dalleClient = new DalleClient(env.OPENAI_API_KEY, env.AI_MODEL_VISUAL);
      const prompt = instruction ?? `Professional image for ${visual.visualType}`;
      const result = await dalleClient.generate(prompt, visual.visualType);
      imageUrl = result.url;
      promptUsed = result.revisedPrompt;
    } else {
      const unsplashClient = new UnsplashClient(env.UNSPLASH_ACCESS_KEY);
      const result = await unsplashClient.search(instruction ?? visual.visualType);
      imageUrl = result.url;
      promptUsed = instruction ?? visual.visualType;
    }

    const key = `visuals/${user_id}/${content_package_id}/${visual.visualType}-v${visual.version + 1}-${Date.now()}.jpg`;
    let cdnUrl: string;
    try {
      cdnUrl = await uploadToR2(key, imageUrl, user_id);
    } catch {
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

    await publishToUser(redis, user_id, {
      event: 'visual_regenerated',
      data: { visual_id, content_package_id, version: visual.version + 1 },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, visual_id }, 'Visual regeneration failed');
    await db.update(visuals).set({ status: 'ready', updatedAt: new Date() }).where(eq(visuals.id, visual_id));
    throw err;
  }
}
