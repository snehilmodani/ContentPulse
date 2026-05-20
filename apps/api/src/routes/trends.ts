import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { domainProfiles, ideas, trendRuns, trends } from '@contentpulse/db';
import type { IdeaStatus, TrendHarvestingJobPayload } from '@contentpulse/types';
import { notFound } from '../lib/errors';

export async function trendRoutes(fastify: FastifyInstance & { db: Db }) {
  fastify.post(
    '/trend-runs',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const userId = request.user.id;

      const query = request.query as { trend_cap?: string };
      let trendCap: number | undefined;
      if (query.trend_cap !== undefined) {
        const parsed = parseInt(query.trend_cap, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 20) {
          return reply.code(400).send({
            error: { code: 'INVALID_QUERY', message: 'trend_cap must be an integer between 1 and 20' },
          });
        }
        trendCap = parsed;
      }

      const [profile] = await fastify.db
        .select()
        .from(domainProfiles)
        .where(eq(domainProfiles.userId, userId))
        .limit(1);
      if (!profile) throw notFound('DomainProfile', userId);

      const today = new Date().toISOString().slice(0, 10);

      const [trendRun] = await fastify.db
        .insert(trendRuns)
        .values({ userId, runDate: today })
        .returning({ id: trendRuns.id, status: trendRuns.status, runDate: trendRuns.runDate });

      if (!trendRun) throw new Error('Failed to create trend_run');

      const payload: TrendHarvestingJobPayload = {
        job_type: 'trend_harvesting',
        user_id: userId,
        trend_run_id: trendRun.id,
        domain_profile: {
          primary_domain: profile.primaryDomain,
          sub_domains: profile.subDomains ?? [],
          region: profile.region,
          tone_of_voice: profile.toneOfVoice ?? [],
        },
        sources: ['x_twitter', 'google_trends', 'newsapi', 'reddit', 'youtube'],
        scheduled_for: new Date().toISOString(),
        ...(trendCap !== undefined ? { trend_cap: trendCap } : {}),
      };

      await fastify.addJob('trend-harvesting', payload);

      return reply.code(201).send({
        id: trendRun.id,
        status: trendRun.status,
        run_date: trendRun.runDate,
      });
    },
  );

  fastify.get(
    '/trend-runs',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const query = request.query as { page?: string; limit?: string; status?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
      const offset = (page - 1) * limit;

      const conditions = [eq(trendRuns.userId, request.user.id)];

      const runs = await fastify.db
        .select()
        .from(trendRuns)
        .where(and(...conditions))
        .orderBy(desc(trendRuns.createdAt))
        .limit(limit)
        .offset(offset);

      const totalRows = await fastify.db.select({ total: count() }).from(trendRuns).where(and(...conditions));
      const total = totalRows[0]?.total ?? 0;

      const data = await Promise.all(
        runs.map(async (run) => {
          const trendCountRows = await fastify.db.select({ total: count() }).from(trends).where(eq(trends.trendRunId, run.id));
          const ideaCountRows = await fastify.db.select({ total: count() }).from(ideas).where(eq(ideas.trendRunId, run.id));
          const pendingCountRows = await fastify.db.select({ total: count() }).from(ideas).where(and(eq(ideas.trendRunId, run.id), eq(ideas.status, 'pending')));

          return {
            id: run.id,
            run_date: run.runDate,
            status: run.status,
            trend_count: trendCountRows[0]?.total ?? 0,
            idea_count: ideaCountRows[0]?.total ?? 0,
            pending_idea_count: pendingCountRows[0]?.total ?? 0,
          };
        }),
      );

      return reply.send({ data, meta: { page, limit, total } });
    },
  );

  fastify.get<{ Params: { runId: string } }>(
    '/trend-runs/:runId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [run] = await fastify.db
        .select()
        .from(trendRuns)
        .where(and(eq(trendRuns.id, request.params.runId), eq(trendRuns.userId, request.user.id)))
        .limit(1);

      if (!run) throw notFound('TrendRun', request.params.runId);

      const trendList = await fastify.db
        .select()
        .from(trends)
        .where(eq(trends.trendRunId, run.id))
        .orderBy(trends.compositeScore);

      const trendSummaries = await Promise.all(
        trendList.map(async (t) => {
          const ideaCountRows = await fastify.db.select({ total: count() }).from(ideas).where(eq(ideas.trendId, t.id));

          return {
            id: t.id,
            topic_name: t.topicName,
            category: t.category,
            composite_score: t.compositeScore ?? '0',
            idea_count: ideaCountRows[0]?.total ?? 0,
          };
        }),
      );

      return reply.send({
        id: run.id,
        run_date: run.runDate,
        status: run.status,
        stage_timings: run.stageTimings,
        trends: trendSummaries,
      });
    },
  );

  fastify.get<{ Params: { runId: string } }>(
    '/trend-runs/:runId/ideas',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const query = request.query as { status?: IdeaStatus; angle_type?: string; page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
      const offset = (page - 1) * limit;

      const [run] = await fastify.db
        .select({ id: trendRuns.id })
        .from(trendRuns)
        .where(and(eq(trendRuns.id, request.params.runId), eq(trendRuns.userId, request.user.id)))
        .limit(1);

      if (!run) throw notFound('TrendRun', request.params.runId);

      const conditions = [eq(ideas.trendRunId, run.id)];
      if (query.status) conditions.push(eq(ideas.status, query.status));

      const ideaList = await fastify.db
        .select()
        .from(ideas)
        .where(and(...conditions))
        .orderBy(desc(ideas.relevanceScore))
        .limit(limit)
        .offset(offset);

      const totalRows2 = await fastify.db.select({ total: count() }).from(ideas).where(and(...conditions));
      const total = totalRows2[0]?.total ?? 0;

      const data = await Promise.all(
        ideaList.map(async (idea) => {
          const [trend] = await fastify.db
            .select()
            .from(trends)
            .where(eq(trends.id, idea.trendId))
            .limit(1);

          return {
            id: idea.id,
            trend: trend
              ? {
                  id: trend.id,
                  topic_name: trend.topicName,
                  topic_slug: trend.topicSlug,
                  category: trend.category,
                  source_platform: trend.sourcePlatform,
                  composite_score: trend.compositeScore ?? '0',
                }
              : null,
            angle_type: idea.angleType,
            hook_line: idea.hookLine,
            platform_fit: idea.platformFit ?? [],
            relevance_score: idea.relevanceScore,
            status: idea.status,
          };
        }),
      );

      return reply.send({ data, meta: { page, limit, total } });
    },
  );
}
