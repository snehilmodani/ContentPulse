import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { drafts, topicBriefs } from '@contentpulse/db';
import type { DraftFormat, DraftRegenerationJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import { publishToUser } from '../../lib/ws-publish';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  logger: Logger;
}

const FORMAT_INSTRUCTIONS: Record<DraftFormat, string> = {
  x_thread: 'Return JSON: { hook_tweet, tweets:[{number,text}], cta_tweet, hashtags }',
  linkedin_article: 'Return JSON: { title, hook, body (markdown), cta, estimated_read_time_minutes }',
  linkedin_carousel: 'Return JSON: { slides:[{slide_number,headline,body}], cover_slide, cta_slide }',
  instagram_post: 'Return JSON: { caption, hashtags, cta, image_brief }',
  reel_script: 'Return JSON: { hook_3s, full_script, storyboard:[{shot,description,on_screen_text,broll}], suggested_audio, word_count }',
  blog_post: 'Return JSON: { seo_title, meta_description, body (markdown), estimated_read_time_minutes, internal_link_suggestions }',
};

function safeParse(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw_text: text }; }
}

export async function processDraftRegeneration(
  payload: DraftRegenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, aiClient, logger } = deps;
  const { user_id, draft_id, content_package_id, format, instruction, topic_brief_id } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id, format, instruction, topicBriefId: topic_brief_id }, 'draft-regeneration started');

  const [draft] = await db.select().from(drafts).where(eq(drafts.id, draft_id)).limit(1);
  if (!draft) {
    logger.error({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id }, 'Draft not found in DB');
    throw new Error(`Draft ${draft_id} not found`);
  }

  logger.info({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id, currentStatus: draft.status, currentVersion: draft.version }, 'Draft fetched from DB');

  const [brief] = await db.select().from(topicBriefs).where(eq(topicBriefs.id, topic_brief_id)).limit(1);
  logger.info({ userId: user_id, draftId: draft_id, topicBriefId: topic_brief_id, found: !!brief }, 'Topic brief fetched');

  try {
    const systemPromptText = `You are a professional content writer. Regenerate the following ${format.replace(/_/g, ' ')} based on the instruction provided. ${FORMAT_INSTRUCTIONS[format as DraftFormat] ?? ''}`;
    const userPromptText = `Previous content: ${JSON.stringify(draft.contentBody).slice(0, 500)}\n\nInstruction: ${instruction}\n\nBrief context: ${brief?.topicSummary?.slice(0, 200) ?? ''}`;

    logger.info({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id, format, model: aiClient.defaultModel }, 'Calling AI for draft regeneration');

    const result = await aiClient.complete({
      userId: user_id,
      systemBlocks: [{ text: systemPromptText, cacheable: false }],
      messages: [{ role: 'user', content: userPromptText }],
      maxTokens: 4096,
    });

    const isRawFallback = 'raw_text' in safeParse(result.text);
    if (isRawFallback) {
      logger.warn({ userId: user_id, draftId: draft_id, format, responseSnippet: result.text.slice(0, 200) }, 'AI response was not valid JSON — stored as raw_text');
    }

    logger.info({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id, format, inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheReadTokens: result.cacheReadTokens, cacheCreationTokens: result.cacheCreationTokens, rawFallback: isRawFallback, duration_ms: Date.now() - startMs }, 'AI response received — updating draft');

    const newContent = safeParse(result.text);
    const prevVersions = (draft.previousVersions as unknown[]) ?? [];

    await db
      .update(drafts)
      .set({
        status: 'draft',
        contentBody: newContent,
        regenerationPrompt: instruction,
        version: draft.version + 1,
        previousVersions: [...prevVersions, { version: draft.version, content: draft.contentBody, regenerated_at: new Date().toISOString() }],
        generationMeta: {
          model: aiClient.defaultModel,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cache_read_tokens: result.cacheReadTokens,
          cache_creation_tokens: result.cacheCreationTokens,
          system_prompt: systemPromptText,
          prompt_used: userPromptText,
        },
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draft_id));

    logger.info({ userId: user_id, draftId: draft_id, contentPackageId: content_package_id, format, newVersion: draft.version + 1, duration_ms: Date.now() - startMs }, 'draft-regeneration complete');

    await publishToUser(redis, user_id, {
      event: 'draft_regenerated',
      data: { draft_id, content_package_id, version: draft.version + 1 },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId: user_id, draftId: draft_id, contentPackageId: content_package_id, format, duration_ms: Date.now() - startMs }, 'Draft regeneration failed — resetting status to draft');
    await db
      .update(drafts)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(drafts.id, draft_id));
    throw err;
  }
}
