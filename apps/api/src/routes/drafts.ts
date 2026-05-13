import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { drafts, topicBriefs } from '@contentpulse/db';
import type { DraftRegenerationJobPayload, RejectDraftBody } from '@contentpulse/types';
import { badRequest, notFound } from '../lib/errors';

export async function draftRoutes(fastify: FastifyInstance & { db: Db; addJob: Function; queues: Record<string, { add: Function }> }) {
  fastify.get<{ Params: { draftId: string } }>(
    '/drafts/:draftId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [draft] = await fastify.db
        .select()
        .from(drafts)
        .where(and(eq(drafts.id, request.params.draftId), eq(drafts.userId, request.user.id)))
        .limit(1);

      if (!draft) throw notFound('Draft', request.params.draftId);

      return reply.send({
        id: draft.id,
        content_package_id: draft.contentPackageId,
        format: draft.format,
        status: draft.status,
        content_body: draft.contentBody,
        version: draft.version,
        approved_at: draft.approvedAt?.toISOString() ?? null,
        rejected_at: draft.rejectedAt?.toISOString() ?? null,
        rejection_reason: draft.rejectionReason,
        generation_meta: draft.generationMeta,
        created_at: draft.createdAt.toISOString(),
        updated_at: draft.updatedAt.toISOString(),
      });
    },
  );

  fastify.post<{ Params: { draftId: string }; Body: { instruction: string } }>(
    '/drafts/:draftId/regenerate',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [draft] = await fastify.db
        .select()
        .from(drafts)
        .where(and(eq(drafts.id, request.params.draftId), eq(drafts.userId, request.user.id)))
        .limit(1);

      if (!draft) throw notFound('Draft', request.params.draftId);
      if (draft.status === 'regenerating') throw badRequest('Draft is already regenerating');

      const [brief] = await fastify.db
        .select({ id: topicBriefs.id })
        .from(topicBriefs)
        .where(eq(topicBriefs.contentPackageId, draft.contentPackageId))
        .limit(1);

      await fastify.db
        .update(drafts)
        .set({ status: 'regenerating', updatedAt: new Date() })
        .where(eq(drafts.id, draft.id));

      const jobPayload: DraftRegenerationJobPayload = {
        job_type: 'draft_regeneration',
        user_id: request.user.id,
        draft_id: draft.id,
        content_package_id: draft.contentPackageId,
        format: draft.format,
        instruction: request.body.instruction,
        topic_brief_id: brief?.id ?? '',
      };

      const job = await fastify.queues['content-drafting'].add('draft_regeneration', jobPayload);

      return reply.status(202).send({
        draft_id: draft.id,
        status: 'regenerating',
        job_id: job.id,
      });
    },
  );

  fastify.post<{ Params: { draftId: string } }>(
    '/drafts/:draftId/approve',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [draft] = await fastify.db
        .select({ id: drafts.id, userId: drafts.userId })
        .from(drafts)
        .where(and(eq(drafts.id, request.params.draftId), eq(drafts.userId, request.user.id)))
        .limit(1);

      if (!draft) throw notFound('Draft', request.params.draftId);

      const now = new Date();
      await fastify.db
        .update(drafts)
        .set({ status: 'approved', approvedAt: now, updatedAt: now })
        .where(eq(drafts.id, draft.id));

      return reply.send({ draft_id: draft.id, status: 'approved', approved_at: now.toISOString() });
    },
  );

  fastify.post<{ Params: { draftId: string }; Body: RejectDraftBody }>(
    '/drafts/:draftId/reject',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [draft] = await fastify.db
        .select({ id: drafts.id, userId: drafts.userId })
        .from(drafts)
        .where(and(eq(drafts.id, request.params.draftId), eq(drafts.userId, request.user.id)))
        .limit(1);

      if (!draft) throw notFound('Draft', request.params.draftId);

      const now = new Date();
      await fastify.db
        .update(drafts)
        .set({ status: 'rejected', rejectedAt: now, rejectionReason: request.body?.reason, updatedAt: now })
        .where(eq(drafts.id, draft.id));

      return reply.send({ draft_id: draft.id, status: 'rejected' });
    },
  );
}
