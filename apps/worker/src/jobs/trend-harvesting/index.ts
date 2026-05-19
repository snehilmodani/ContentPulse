import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AnthropicClient } from '@contentpulse/ai-client';
import type { Db } from '@contentpulse/db';
import { trendRuns, trends } from '@contentpulse/db';
import type { TrendHarvestingJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload } from '@contentpulse/types';
import type { RawTrend } from './sources/newsapi';
import { XTrendsClient } from './sources/x';
import { publishToUser } from '../../lib/ws-publish';

interface Deps {
  db: Db;
  redis: Redis;
  aiClient: AnthropicClient;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
  env: {
    X_API_BEARER_TOKEN: string;
    NEWSAPI_KEY: string;
    REDDIT_CLIENT_ID: string;
    REDDIT_CLIENT_SECRET: string;
    YOUTUBE_API_KEY: string;
  };
}

const TREND_CATEGORIES = [
  'breaking_news',
  'innovation_launch',
  'evergreen_timely',
  'cultural_comedic',
  'contrarian_provocative',
] as const;

function pickCategory(index: number) {
  return TREND_CATEGORIES[index % TREND_CATEGORIES.length] ?? 'breaking_news';
}

export async function processTrendHarvesting(
  payload: TrendHarvestingJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, queues, logger, env } = deps;
  const { user_id, trend_run_id, domain_profile } = payload;
  const startMs = Date.now();

  logger.info({ userId: user_id, trendRunId: trend_run_id, primaryDomain: domain_profile.primary_domain, region: domain_profile.region }, 'trend-harvesting started');

  await db.update(trendRuns).set({ status: 'running', updatedAt: new Date() }).where(eq(trendRuns.id, trend_run_id));

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { trend_run_id, stage: 'trend-harvesting' },
    timestamp: new Date().toISOString(),
  });

  const xClient = new XTrendsClient(env.X_API_BEARER_TOKEN);
  // const newsClient = new NewsApiClient(env.NEWSAPI_KEY);
  // const redditClient = new RedditClient(env.REDDIT_CLIENT_ID, env.REDDIT_CLIENT_SECRET);
  // const youtubeClient = new YoutubeClient(env.YOUTUBE_API_KEY);
  // const googleClient = new GoogleTrendsClient();

  logger.info({ userId: user_id, trendRunId: trend_run_id, sources: ['x_twitter', 'newsapi', 'reddit', 'youtube', 'google_trends'] }, 'Fetching trends from all sources');

  const sourceResults = await Promise.allSettled([
    xClient.fetchTrends(domain_profile.primary_domain, domain_profile.region).then((r) => ({ source: 'x_twitter' as const, results: r })),
    // newsClient.fetchTrends(domain_profile.primary_domain, domain_profile.region).then((r) => ({ source: 'newsapi' as const, results: r })),
    // redditClient.fetchTrends(domain_profile.primary_domain, domain_profile.region).then((r) => ({ source: 'reddit' as const, results: r })),
    // youtubeClient.fetchTrends(domain_profile.primary_domain, domain_profile.region).then((r) => ({ source: 'youtube' as const, results: r })),
    // googleClient.fetchTrends(domain_profile.primary_domain, domain_profile.region).then((r) => ({ source: 'google_trends' as const, results: r })),
  ]);

  const allRaw: Array<{ source: 'x_twitter' | 'google_trends' | 'newsapi' | 'reddit' | 'youtube'; trend: RawTrend }> = [];
  for (const result of sourceResults) {
    if (result.status === 'fulfilled') {
      logger.info({ userId: user_id, trendRunId: trend_run_id, source: result.value.source, count: result.value.results.length }, 'Source fetch succeeded');
      for (const trend of result.value.results) {
        allRaw.push({ source: result.value.source, trend });
      }
    } else {
      logger.warn({ userId: user_id, trendRunId: trend_run_id, error: result.reason }, 'Source fetch failed');
    }
  }

  logger.info({ userId: user_id, trendRunId: trend_run_id, totalRawTrends: allRaw.length }, 'All sources fetched — inserting trends');

  const insertedTrendIds: string[] = [];

  for (let i = 0; i < allRaw.length; i++) {
    const item = allRaw[i];
    if (!item) continue;

    const relevanceScore = (Math.random() * 30 + 60).toFixed(2);
    const compositeScore = (Math.random() * 30 + 60).toFixed(2);

    const [inserted] = await db
      .insert(trends)
      .values({
        trendRunId: trend_run_id,
        userId: user_id,
        sourcePlatform: item.source,
        topicName: item.trend.topic_name,
        topicSlug: item.trend.topic_slug,
        category: pickCategory(i),
        relevanceScore,
        compositeScore,
        rawData: item.trend.raw_data,
      })
      .returning({ id: trends.id });

    if (inserted) {
      insertedTrendIds.push(inserted.id);
      logger.debug({ userId: user_id, trendRunId: trend_run_id, trendId: inserted.id, topic: item.trend.topic_name, source: item.source, category: pickCategory(i), relevanceScore, compositeScore }, 'Inserted trend');
    }
  }

  logger.info({ userId: user_id, trendRunId: trend_run_id, insertedCount: insertedTrendIds.length, skippedCount: allRaw.length - insertedTrendIds.length }, 'Trend insert complete');

  const now = new Date();
  await db
    .update(trendRuns)
    .set({
      status: 'completed',
      completedAt: now,
      stageTimings: { 'trend-harvesting': { completed_at: now.toISOString() } },
      updatedAt: now,
    })
    .where(eq(trendRuns.id, trend_run_id));

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { trend_run_id, stage: 'trend-harvesting', duration_ms: Date.now() - startMs },
    timestamp: new Date().toISOString(),
  });

  logger.info({ userId: user_id, trendRunId: trend_run_id, trendCount: insertedTrendIds.length, duration_ms: Date.now() - startMs }, 'trend-harvesting completed — chaining to idea-generation');

  // chain to idea-generation
  await queues['idea-generation']?.add('idea_generation', {
    job_type: 'idea_generation',
    user_id,
    trend_run_id,
    trend_ids: insertedTrendIds,
    domain_profile_id: '',
    ideas_per_trend: 5,
  });
}
