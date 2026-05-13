import type { FastifyInstance } from 'fastify';
import { and, count, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { ideas, trendRuns, trends } from '@contentpulse/db';
import type { IdeaStatus } from '@contentpulse/types';
import { notFound } from '../lib/errors';

export async function trendRoutes(fastify: FastifyInstance & { db: Db }) {
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
        .orderBy(trendRuns.runDate)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await fastify.db
        .select({ total: count() })
        .from(trendRuns)
        .where(and(...conditions));

      const data = await Promise.all(
        runs.map(async (run) => {
          const [trendCount] = await fastify.db
            .select({ total: count() })
            .from(trends)
            .where(eq(trends.trendRunId, run.id));

          const [ideaCount] = await fastify.db
            .select({ total: count() })
            .from(ideas)
            .where(eq(ideas.trendRunId, run.id));

          const [pendingCount] = await fastify.db
            .select({ total: count() })
            .from(ideas)
            .where(and(eq(ideas.trendRunId, run.id), eq(ideas.status, 'pending')));

          return {
            id: run.id,
            run_date: run.runDate,
            status: run.status,
            trend_count: trendCount?.total ?? 0,
            idea_count: ideaCount?.total ?? 0,
            pending_idea_count: pendingCount?.total ?? 0,
          };
        }),
      );

      return reply.send({ data, meta: { page, limit, total: total ?? 0 } });
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
          const [{ total }] = await fastify.db
            .select({ total: count() })
            .from(ideas)
            .where(eq(ideas.trendId, t.id));

          return {
            id: t.id,
            topic_name: t.topicName,
            category: t.category,
            composite_score: t.compositeScore ?? '0',
            idea_count: total ?? 0,
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
        .orderBy(ideas.relevanceScore)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await fastify.db
        .select({ total: count() })
        .from(ideas)
        .where(and(...conditions));

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

      return reply.send({ data, meta: { page, limit, total: total ?? 0 } });
    },
  );
}
