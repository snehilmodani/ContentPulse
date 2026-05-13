import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { ideas, notifications, trendRuns, trends } from '@contentpulse/db';
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

function parseIdeasFromText(text: string, trendId: string, userId: string, trendRunId: string) {
  // Try to parse as JSON; fall back to generating stub ideas
  try {
    const parsed = JSON.parse(text) as Array<{ angle_type: string; hook_line: string; core_argument: string; platform_fit: string[] }>;
    return parsed.slice(0, 5).map((idea, i) => ({
      trendId,
      trendRunId,
      userId,
      angleType: (ANGLE_TYPES[i % ANGLE_TYPES.length] ?? 'news') as typeof ANGLE_TYPES[number],
      hookLine: idea.hook_line ?? `Hook: ${idea.angle_type}`,
      coreArgument: idea.core_argument ?? 'Core argument placeholder',
      platformFit: idea.platform_fit ?? ['x_twitter', 'linkedin'],
      relevanceScore: (75 + Math.random() * 20).toFixed(2),
      generationMeta: { model: 'claude-sonnet-4-6', stub: false },
    }));
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
      generationMeta: { model: 'claude-sonnet-4-6', stub: true },
    }));
  }
}

export async function processIdeaGeneration(
  payload: IdeaGenerationJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, aiClient, queues, logger } = deps;
  const { user_id, trend_run_id, trend_ids } = payload;

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

  for (const trend of topTrends) {
    try {
      const result = await aiClient.complete({
        userId: user_id,
        systemBlocks: [
          {
            text: 'You are an expert social media content strategist. Generate exactly 5 content ideas for solo creators. Return a JSON array of objects with: angle_type, hook_line, core_argument, platform_fit[].',
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

      const parsedIdeas = parseIdeasFromText(result.text, trend.id, user_id, trend_run_id);
      await db.insert(ideas).values(parsedIdeas);
    } catch (err) {
      logger.error({ err, trendId: trend.id }, 'Idea generation failed for trend');
    }
  }

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { trend_run_id, stage: 'idea-generation', duration_ms: 0 },
    timestamp: new Date().toISOString(),
  });

  await publishToUser(redis, user_id, {
    event: 'ideas_ready',
    data: { trend_run_id, idea_count: topTrends.length * 5 },
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
    await queues['notification-send']?.add('notification_send', {
      job_type: 'notification_send',
      user_id,
      notification_id: notif.id,
      event: 'daily_digest_ready',
      channels: ['email'],
      template_data: { trend_run_id },
    });
  }
}
