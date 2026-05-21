import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { contentPackages, ideas, trends } from '@contentpulse/db';
import type { PublishedPlatform, RejectIdeaBody, ResearchBriefJobPayload, UpdateIdeaBody } from '@contentpulse/types';
import { badRequest, notFound } from '../lib/errors';
import type { Redis } from 'ioredis';

const PUBLISHED_PLATFORMS: readonly PublishedPlatform[] = ['x_twitter', 'linkedin', 'instagram', 'youtube', 'blog_post'];

export async function ideaRoutes(
  fastify: FastifyInstance & { db: Db; redis: Redis },
) {
  fastify.get<{ Params: { ideaId: string } }>(
    '/ideas/:ideaId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [idea] = await fastify.db
        .select()
        .from(ideas)
        .where(and(eq(ideas.id, request.params.ideaId), eq(ideas.userId, request.user.id)))
        .limit(1);

      if (!idea) throw notFound('Idea', request.params.ideaId);

      const [trend] = await fastify.db
        .select()
        .from(trends)
        .where(eq(trends.id, idea.trendId))
        .limit(1);

      return reply.send({
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
        core_argument: idea.coreArgument,
        platform_fit: idea.platformFit ?? [],
        effort_estimate: idea.effortEstimate,
        relevance_score: idea.relevanceScore,
        status: idea.status,
        rejection_reason: idea.rejectionReason,
        generation_meta: idea.generationMeta,
        created_at: idea.createdAt.toISOString(),
      });
    },
  );

  fastify.patch<{ Params: { ideaId: string }; Body: UpdateIdeaBody }>(
    '/ideas/:ideaId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [idea] = await fastify.db
        .select()
        .from(ideas)
        .where(and(eq(ideas.id, request.params.ideaId), eq(ideas.userId, request.user.id)))
        .limit(1);

      if (!idea) throw notFound('Idea', request.params.ideaId);
      if (idea.status !== 'pending') throw badRequest(`Cannot edit an idea that is ${idea.status}`);

      const body = request.body ?? {};
      if (body.hook_line !== undefined && (body.hook_line.length < 1 || body.hook_line.length > 280)) {
        throw badRequest('hook_line must be 1-280 chars');
      }
      if (body.core_argument !== undefined && (body.core_argument.length < 1 || body.core_argument.length > 2000)) {
        throw badRequest('core_argument must be 1-2000 chars');
      }
      if (body.platform_fit !== undefined) {
        if (!Array.isArray(body.platform_fit)) throw badRequest('platform_fit must be an array');
        const invalid = (body.platform_fit as string[]).find((p) => !(PUBLISHED_PLATFORMS as readonly string[]).includes(p));
        if (invalid !== undefined) {
          throw badRequest(`platform_fit contains invalid platform: ${invalid}. Allowed: ${PUBLISHED_PLATFORMS.join(', ')}`);
        }
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.hook_line !== undefined) patch['hookLine'] = body.hook_line;
      if (body.core_argument !== undefined) patch['coreArgument'] = body.core_argument;
      if (body.platform_fit !== undefined) patch['platformFit'] = body.platform_fit;

      await fastify.db.update(ideas).set(patch).where(eq(ideas.id, idea.id));

      const [trend] = await fastify.db.select().from(trends).where(eq(trends.id, idea.trendId)).limit(1);
      return reply.send({
        id: idea.id,
        trend: trend
          ? { id: trend.id, topic_name: trend.topicName, topic_slug: trend.topicSlug, category: trend.category, source_platform: trend.sourcePlatform, composite_score: trend.compositeScore ?? '0' }
          : null,
        angle_type: idea.angleType,
        hook_line: body.hook_line ?? idea.hookLine,
        core_argument: body.core_argument ?? idea.coreArgument,
        platform_fit: body.platform_fit ?? idea.platformFit ?? [],
        effort_estimate: idea.effortEstimate,
        relevance_score: idea.relevanceScore,
        status: idea.status,
        rejection_reason: idea.rejectionReason,
        generation_meta: idea.generationMeta,
        created_at: idea.createdAt.toISOString(),
      });
    },
  );

  fastify.post<{ Params: { ideaId: string } }>(
    '/ideas/:ideaId/approve',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [idea] = await fastify.db
        .select()
        .from(ideas)
        .where(and(eq(ideas.id, request.params.ideaId), eq(ideas.userId, request.user.id)))
        .limit(1);

      if (!idea) throw notFound('Idea', request.params.ideaId);
      if (idea.status !== 'pending') throw badRequest(`Idea is already ${idea.status}`);

      const [contentPackage] = await fastify.db.transaction(async (tx) => {
        await tx
          .update(ideas)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(eq(ideas.id, idea.id));

        return tx
          .insert(contentPackages)
          .values({ ideaId: idea.id, userId: request.user.id })
          .returning();
      });

      if (!contentPackage) throw new Error('Failed to create content package');

      const [trend] = await fastify.db
        .select()
        .from(trends)
        .where(eq(trends.id, idea.trendId))
        .limit(1);

      const jobPayload: ResearchBriefJobPayload = {
        job_type: 'research_brief',
        user_id: request.user.id,
        content_package_id: contentPackage.id,
        idea_id: idea.id,
        idea: {
          hook_line: idea.hookLine,
          core_argument: idea.coreArgument,
          angle_type: idea.angleType,
          platform_fit: idea.platformFit ?? [],
        },
        domain_profile: {
          primary_domain: trend?.topicSlug ?? idea.hookLine,
          region: 'IN-MH',
        },
      };

      await fastify.addJob('research-brief', jobPayload);

      return reply.send({
        idea_id: idea.id,
        status: 'approved',
        content_package: { id: contentPackage.id, status: 'pending' },
      });
    },
  );

  fastify.post<{ Params: { ideaId: string }; Body: RejectIdeaBody }>(
    '/ideas/:ideaId/reject',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [idea] = await fastify.db
        .select({ id: ideas.id, userId: ideas.userId, status: ideas.status })
        .from(ideas)
        .where(and(eq(ideas.id, request.params.ideaId), eq(ideas.userId, request.user.id)))
        .limit(1);

      if (!idea) throw notFound('Idea', request.params.ideaId);

      await fastify.db
        .update(ideas)
        .set({ status: 'rejected', updatedAt: new Date(), ...(request.body?.reason !== undefined ? { rejectionReason: request.body.reason } : {}) })
        .where(eq(ideas.id, idea.id));

      return reply.send({ idea_id: idea.id, status: 'rejected' });
    },
  );

  fastify.post<{ Params: { ideaId: string } }>(
    '/ideas/:ideaId/defer',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [idea] = await fastify.db
        .select({ id: ideas.id, userId: ideas.userId })
        .from(ideas)
        .where(and(eq(ideas.id, request.params.ideaId), eq(ideas.userId, request.user.id)))
        .limit(1);

      if (!idea) throw notFound('Idea', request.params.ideaId);

      await fastify.db
        .update(ideas)
        .set({ status: 'deferred', updatedAt: new Date() })
        .where(eq(ideas.id, idea.id));

      return reply.send({ idea_id: idea.id, status: 'deferred' });
    },
  );
}
