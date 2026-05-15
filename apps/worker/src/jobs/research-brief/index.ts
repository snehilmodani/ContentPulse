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
  env: { OPENROUTER_API_KEY: string; AI_MODEL_RESEARCH: string; BYPASS_RESEARCH: string };
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

  const perplexity = new PerplexityClient(env.OPENROUTER_API_KEY, env.AI_MODEL_RESEARCH);

  const researchPrompt = `Research the topic "${idea.hook_line}" thoroughly for a content creator in ${domain_profile.region}.\n\nReturn a single JSON object with EXACTLY these keys (and no others):\n- topic_summary: string — 2-3 paragraph plain-text summary\n- key_facts: array of { fact: string, source_url: string, confidence: number }\n- timeline: array of { date: string, event: string }\n- key_players: array of { name: string, role: string, org: string }\n- opposing_views: string\n- regional_angle: string — relevance to ${domain_profile.region}\n- related_topics: array of strings\n- sources: array of { title: string, url: string, publication: string, published_at: string }\n- fact_check_flags: array of { claim: string, flag: string, note: string }\n\nDo not wrap the JSON in markdown fences. Do not include any extra keys.`;

  logger.info({ content_package_id, model: env.AI_MODEL_RESEARCH }, 'Starting research');

  let researchResult;
  if (env.BYPASS_RESEARCH === 'true') {
    logger.info({ content_package_id }, 'Research bypassed — using stub data');
    researchResult = {
      topic_summary: `[STUB] Research summary for "${idea.hook_line}" targeting ${domain_profile.region}.`,
      key_facts: [{ fact: `Key fact about ${idea.hook_line}`, source_url: 'https://example.com', confidence: 0.9 }],
      timeline: [{ date: new Date().toISOString().split('T')[0] ?? '2026-01-01', event: `Initial event for ${idea.hook_line}` }],
      key_players: [{ name: 'Key Person', role: 'Expert', org: 'Organization' }],
      opposing_views: `Some analysts disagree about ${idea.hook_line}.`,
      regional_angle: `Specific relevance to ${domain_profile.region}: this topic has local implications.`,
      related_topics: ['technology', 'innovation', 'business'],
      sources: [{ title: `Article about ${idea.hook_line}`, url: 'https://example.com/article', publication: 'Example News', published_at: new Date().toISOString() }],
      fact_check_flags: [] as Array<{ claim: string; flag: string; note: string }>,
    };
  } else {
    try {
      researchResult = await perplexity.research(idea.hook_line, domain_profile.region);
      logger.info({ content_package_id }, 'Research complete');
    } catch (err) {
      logger.error({ err, content_package_id }, 'Perplexity research failed');
      await db
        .update(contentPackages)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(contentPackages.id, content_package_id));
      throw err;
    }
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
      opposingViews: researchResult.opposing_views ?? null,
      regionalAngle: researchResult.regional_angle ?? null,
      relatedTopics: researchResult.related_topics,
      sources: researchResult.sources,
      factCheckFlags: researchResult.fact_check_flags,
      researchMeta: { perplexity_model: env.AI_MODEL_RESEARCH, prompt_used: researchPrompt },
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
