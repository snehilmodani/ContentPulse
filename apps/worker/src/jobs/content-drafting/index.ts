import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { contentPackages, domainProfiles, drafts, ideas, notifications, topicBriefs } from '@contentpulse/db';
import type { ContentDraftingJobPayload, DraftFormat } from '@contentpulse/types';
import { and, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';
import { incrStagesDone } from '../../lib/redis-coord';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
}

const FORMAT_INSTRUCTIONS: Record<DraftFormat, string> = {
  x_thread: `Return JSON: { hook_tweet: string, tweets: [{number, text}], cta_tweet: string, hashtags: string[] }`,
  linkedin_article: `Return JSON: { title: string, hook: string, body: string (markdown), cta: string, estimated_read_time_minutes: number }`,
  linkedin_carousel: `Return JSON: { slides: [{slide_number, headline, body}], cover_slide: string, cta_slide: string }`,
  instagram_post: `Return JSON: { caption: string, hashtags: string[], cta: string, image_brief: string }`,
  reel_script: `Return JSON: { hook_3s: string, full_script: string, storyboard: [{shot, description, on_screen_text, broll}], suggested_audio: string, word_count: number }`,
  blog_post: `Return JSON: { seo_title: string, meta_description: string, body: string (markdown), estimated_read_time_minutes: number, internal_link_suggestions: string[] }`,
};

function safeParseContent(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw_text: text };
  }
}

export async function processContentDrafting(
  payload: ContentDraftingJobPayload,
  deps: Deps,
): Promise<void> {
  if (payload.job_type !== 'content_drafting') return;
  const { db, redis, aiClient, queues, logger } = deps;
  const { user_id, content_package_id, topic_brief_id, idea_id, selected_formats, domain_profile } = payload;

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { content_package_id, stage: 'content-drafting' },
    timestamp: new Date().toISOString(),
  });

  const [brief] = await db.select().from(topicBriefs).where(eq(topicBriefs.id, topic_brief_id)).limit(1);
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, idea_id)).limit(1);
  const [profile] = await db.select().from(domainProfiles).where(eq(domainProfiles.userId, user_id)).limit(1);

  if (!brief || !idea) throw new Error('Missing brief or idea');

  const domainContext = profile?.creatorPersona ?? domain_profile.creator_persona;
  const toneContext = (profile?.toneOfVoice ?? domain_profile.tone_of_voice).join(', ');

  const systemBlock = {
    text: `You are a professional content strategist and writer.
Creator persona: ${domainContext}
Tone of voice: ${toneContext}
Topic: ${brief.topicSummary}
Key angle: ${idea.hookLine} — ${idea.coreArgument}
Always return valid JSON matching the requested format exactly.`,
    cacheable: true,
  };

  for (let fi = 0; fi < selected_formats.length; fi++) {
    const format = selected_formats[fi]!;
    // Space out calls to avoid hitting free-tier rate limits
    if (fi > 0) await new Promise((r) => setTimeout(r, 4_000));
    const formatInstruction = FORMAT_INSTRUCTIONS[format];

    const userMessage = `Write a ${format.replace(/_/g, ' ')} about "${idea.hookLine}".\nKey facts: ${JSON.stringify(brief.keyFacts).slice(0, 500)}\n${formatInstruction}`;

    let contentBody: Record<string, unknown>;
    let generationMeta: Record<string, unknown> = {};

    try {
      const result = await aiClient.complete({
        userId: user_id,
        systemBlocks: [systemBlock],
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 2048,
      });

      contentBody = safeParseContent(result.text);
      generationMeta = {
        model: aiClient.defaultModel,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cache_read_tokens: result.cacheReadTokens,
        cache_creation_tokens: result.cacheCreationTokens,
        system_prompt: systemBlock.text,
        prompt_used: userMessage,
      };
    } catch (err) {
      logger.error({ err, format, content_package_id }, 'Draft generation failed');
      contentBody = { error: String(err) };
      generationMeta = { failed: true };
    }

    // upsert (handles regeneration case too)
    const [existing] = await db
      .select({ version: drafts.version, prevVersions: drafts.previousVersions, contentBody: drafts.contentBody })
      .from(drafts)
      .where(and(eq(drafts.contentPackageId, content_package_id), eq(drafts.format, format)))
      .limit(1);

    if (existing) {
      const prevVersions = (existing.prevVersions as unknown[]) ?? [];
      await db
        .update(drafts)
        .set({
          status: 'draft',
          contentBody,
          generationMeta,
          version: existing.version + 1,
          previousVersions: [...prevVersions, { version: existing.version, content: existing.contentBody, regenerated_at: new Date().toISOString() }],
          updatedAt: new Date(),
        })
        .where(and(eq(drafts.contentPackageId, content_package_id), eq(drafts.format, format)));
    } else {
      await db.insert(drafts).values({
        contentPackageId: content_package_id,
        userId: user_id,
        format,
        status: 'draft',
        contentBody,
        generationMeta,
      });
    }
  }

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { content_package_id, stage: 'content-drafting', duration_ms: 0 },
    timestamp: new Date().toISOString(),
  });

  const stagesDone = await incrStagesDone(redis, content_package_id);

  if (stagesDone >= 2) {
    const draftRows = await db.select().from(drafts).where(eq(drafts.contentPackageId, content_package_id));

    await publishToUser(redis, user_id, {
      event: 'package_ready',
      data: { content_package_id, draft_count: draftRows.length, visual_count: 0 },
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
        channel: 'email',
        title: 'Your content package is ready for review',
        body: 'All drafts and visuals have been generated. Tap to review.',
        payload: { content_package_id },
      })
      .returning();

    if (notif) {
      await queues['notification-send']?.add('notification_send', {
        job_type: 'notification_send',
        user_id,
        notification_id: notif.id,
        event: 'package_ready',
        channels: ['email'],
        template_data: { content_package_id },
      });
    }
  }
}
