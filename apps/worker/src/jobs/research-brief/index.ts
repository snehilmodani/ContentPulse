import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '@contentpulse/db';
import { contentPackages, topicBriefs } from '@contentpulse/db';
import type { ResearchBriefJobPayload } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { JobPayload, ContentDraftingJobPayload, VisualGenerationJobPayload } from '@contentpulse/types';
import { publishToUser } from '../../lib/ws-publish';
import { PerplexityClient } from '../../adapters/perplexity';

interface Deps {
  db: Db;
  redis: Redis;
  queues: Record<string, Queue<JobPayload>>;
  logger: Logger;
  env: { PERPLEXITY_API_KEY: string };
}

export async function processResearchBrief(
  payload: ResearchBriefJobPayload,
  deps: Deps,
): Promise<void> {
  const { db, redis, queues, logger, env } = deps;
  const { user_id, content_package_id, idea_id, idea, domain_profile } = payload;

  await db
    .update(contentPackages)
    .set({ status: 'researching', updatedAt: new Date() })
    .where(eq(contentPackages.id, content_package_id));

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_started',
    data: { content_package_id, stage: 'research-brief' },
    timestamp: new Date().toISOString(),
  });

  const perplexity = new PerplexityClient(env.PERPLEXITY_API_KEY);

  let researchResult;
  try {
    researchResult = await perplexity.research(idea.hook_line, domain_profile.region);
  } catch (err) {
    logger.error({ err, content_package_id }, 'Perplexity research failed');
    await db
      .update(contentPackages)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(contentPackages.id, content_package_id));
    throw err;
  }

  const [brief] = await db
    .insert(topicBriefs)
    .values({
      contentPackageId: content_package_id,
      userId: user_id,
      topicSummary: researchResult.topic_summary,
      keyFacts: researchResult.key_facts,
      timeline: researchResult.timeline,
      keyPlayers: researchResult.key_players,
      opposingViews: researchResult.opposing_views,
      regionalAngle: researchResult.regional_angle,
      relatedTopics: researchResult.related_topics,
      sources: researchResult.sources,
      factCheckFlags: researchResult.fact_check_flags,
      researchMeta: { perplexity_model: 'llama-3.1-sonar-large-128k-online' },
    })
    .returning();

  if (!brief) throw new Error('Failed to insert topic brief');

  await publishToUser(redis, user_id, {
    event: 'pipeline_stage_completed',
    data: { content_package_id, stage: 'research-brief', duration_ms: 0 },
    timestamp: new Date().toISOString(),
  });

  await db
    .update(contentPackages)
    .set({ status: 'drafting', updatedAt: new Date() })
    .where(eq(contentPackages.id, content_package_id));

  const draftingPayload: ContentDraftingJobPayload = {
    job_type: 'content_drafting',
    user_id,
    content_package_id,
    topic_brief_id: brief.id,
    idea_id,
    selected_formats: ['x_thread', 'linkedin_article', 'instagram_post', 'reel_script', 'blog_post'],
    domain_profile: {
      tone_of_voice: ['professional', 'engaging'],
      creator_persona: domain_profile.primary_domain,
      content_mix_ratio: { thought_leadership: 40, trending_news: 40, comedic: 20 },
    },
    brand_kit: { branding_mode: 'flexible' },
  };

  const visualPayload: VisualGenerationJobPayload = {
    job_type: 'visual_generation',
    user_id,
    content_package_id,
    idea_id,
    trend_category: 'innovation_launch',
    visual_types: ['thumbnail', 'square_post', 'story_cover'],
    brand_kit: { logo_r2_key: null, primary_colors: [], branding_mode: 'flexible' },
  };

  await Promise.all([
    queues['content-drafting']?.add('content_drafting', draftingPayload),
    queues['visual-generation']?.add('visual_generation', visualPayload),
  ]);
}
