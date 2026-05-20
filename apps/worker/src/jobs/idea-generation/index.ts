import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { ideas, notifications, trends } from '@contentpulse/db';
import type { IdeaGenerationJobPayload } from '@contentpulse/types';
import { eq, desc } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
}

const ANGLE_TYPES = ['news', 'innovation', 'contrarian', 'comedic', 'tangential_insight'] as const;

const ALLOWED_PLATFORMS = new Set(['x_twitter', 'linkedin', 'instagram', 'youtube']);

export function parseIdeasFromText(text: string, trendId: string, userId: string, trendRunId: string, model: string) {
  try {
    const parsed = JSON.parse(text) as Array<{ angle_type: string; hook_line: string; core_argument: string; platform_fit: string[] }>;
    return parsed.slice(0, 5).map((idea, i) => {
      const rawFit = Array.isArray(idea.platform_fit) ? idea.platform_fit : [];
      const cleanedFit = rawFit.filter((p) => ALLOWED_PLATFORMS.has(p));
      return {
        trendId,
        trendRunId,
        userId,
        angleType: (ANGLE_TYPES[i % ANGLE_TYPES.length] ?? 'news') as typeof ANGLE_TYPES[number],
        hookLine: idea.hook_line ?? `Hook: ${idea.angle_type}`,
        coreArgument: idea.core_argument ?? 'Core argument placeholder',
        platformFit: cleanedFit.length > 0 ? cleanedFit : ['x_twitter', 'linkedin'],
        relevanceScore: (75 + Math.random() * 20).toFixed(2),
        generationMeta: { model, stub: false },
      };
    });
  } catch {
    return ANGLE_TYPES.slice(0, 5).map((angle, i) => ({
      trendId,
      trendRunId,
      userId,
      angleType: angle,
      hookLine: `${angle.charAt(0).toUpperCase() + angle.slice(1)} angle: ${text.slice(0, 60)}`,
      coreArgument: `This ${angle} perspective offers unique insights for creators.`,
      platformFit: ['x_twitter', 'linkedin', 'instagram'],
      relevanceScore: (75 + i * 2).toFixed(2),
      generationMeta: { model, stub: true },
    }));
  }
}

export async function processIdeaGeneration(
  payload: IdeaGenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, aiClient, queues, logger } = deps;
  const { user_id, trend_run_id } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, trendRunId: trend_run_id }, 'idea-generation started');

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { trend_run_id, stage: 'idea-generation' },
    timestamp: new Date().toISOString(),
  });

  // take top 10 trends by composite_score
  const topTrends = await db
    .select()
    .from(trends)
    .where(eq(trends.trendRunId, trend_run_id))
    .orderBy(desc(trends.compositeScore))
    .limit(10);

  logger.info({ userId: user_id, trendRunId: trend_run_id, trendCount: topTrends.length }, 'Fetched top trends for idea generation');

  if (topTrends.length === 0) {
    logger.warn({ userId: user_id, trendRunId: trend_run_id }, 'No trends found for this run — idea generation will produce no ideas');
  }

  let totalIdeasInserted = 0;
  let stubCount = 0;

  for (const trend of topTrends) {
    const trendStart = Date.now();
    logger.info({ userId: user_id, trendRunId: trend_run_id, trendId: trend.id, topic: trend.topicName, category: trend.category }, 'Calling AI for idea generation');

    try {
      const result = await aiClient.complete({
        userId: user_id,
        systemBlocks: [
          {
            text: 'You are an expert social media content strategist. Generate exactly 5 content ideas for solo creators. Return a JSON array of objects with: angle_type, hook_line, core_argument, platform_fit[]. platform_fit must be an array containing only these exact values: "x_twitter", "linkedin", "instagram", "youtube". Pick 1-3 values that best fit each idea.',
            cacheable: false,
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Generate 5 content ideas about: "${trend.topicName}" (category: ${trend.category}). Return only a valid JSON array.`,
          },
        ],
        maxTokens: 1024,
      });

      logger.debug({ userId: user_id, trendId: trend.id, responseLength: result.text.length, duration_ms: Date.now() - trendStart }, 'AI response received');

      const parsedIdeas = parseIdeasFromText(result.text, trend.id, user_id, trend_run_id, aiClient.defaultModel);
      const isStub = parsedIdeas.some((idea) => idea.generationMeta.stub);

      if (isStub) {
        stubCount++;
        logger.warn({ userId: user_id, trendRunId: trend_run_id, trendId: trend.id, rawResponseSnippet: result.text.slice(0, 200) }, 'AI response was not valid JSON — using stub ideas');
      }

      await db.insert(ideas).values(parsedIdeas);
      totalIdeasInserted += parsedIdeas.length;

      logger.info({ userId: user_id, trendRunId: trend_run_id, trendId: trend.id, ideasInserted: parsedIdeas.length, stub: isStub, duration_ms: Date.now() - trendStart }, 'Ideas inserted for trend');
    } catch (err) {
      logger.error({ err, userId: user_id, trendRunId: trend_run_id, trendId: trend.id, topic: trend.topicName, duration_ms: Date.now() - trendStart }, 'Idea generation failed for trend');
    }
  }

  logger.info({ userId: user_id, trendRunId: trend_run_id, totalIdeasInserted, stubCount, trendsProcessed: topTrends.length, duration_ms: Date.now() - startMs }, 'idea-generation complete');

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { trend_run_id, stage: 'idea-generation', duration_ms: Date.now() - startMs },
    timestamp: new Date().toISOString(),
  });

  await publishToUser(redis, user_id, {
    event: 'ideas_ready',
    data: { trend_run_id, idea_count: totalIdeasInserted },
    timestamp: new Date().toISOString(),
  });

  // create notification record and enqueue send
  const [notif] = await db
    .insert(notifications)
    .values({
      userId: user_id,
      event: 'daily_digest_ready',
      channel: 'email',
      title: 'Your daily content ideas are ready',
      body: 'Review your trending ideas and approve the ones you want to develop.',
      payload: { trend_run_id },
    })
    .returning();

  if (notif) {
    logger.info({ userId: user_id, trendRunId: trend_run_id, notificationId: notif.id }, 'Notification record created — enqueueing notification-send');
    await queues['notification-send']?.add('notification_send', {
      job_type: 'notification_send',
      user_id,
      notification_id: notif.id,
      event: 'daily_digest_ready',
      channels: ['email'],
      template_data: { trend_run_id },
    });
  } else {
    logger.warn({ userId: user_id, trendRunId: trend_run_id }, 'Notification insert returned no row — email will not be sent');
  }
}
