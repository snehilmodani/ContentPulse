import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { visuals } from '@contentpulse/db';
import type { RegenerateVisualBody, VisualRegenerationJobPayload } from '@contentpulse/types';
import { badRequest, notFound } from '../lib/errors';

export async function visualRoutes(
  fastify: FastifyInstance & { db: Db; queues: Record<string, { add: Function }> },
) {
  fastify.get<{ Params: { visualId: string } }>(
    '/visuals/:visualId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [visual] = await fastify.db
        .select()
        .from(visuals)
        .where(and(eq(visuals.id, request.params.visualId), eq(visuals.userId, request.user.id)))
        .limit(1);

      if (!visual) throw notFound('Visual', request.params.visualId);

      return reply.send({
        id: visual.id,
        content_package_id: visual.contentPackageId,
        visual_type: visual.visualType,
        width_px: visual.widthPx,
        height_px: visual.heightPx,
        generation_method: visual.generationMethod,
        status: visual.status,
        r2_key: visual.r2Key,
        cdn_url: visual.cdnUrl,
        prompt_used: visual.promptUsed,
        source_url: visual.sourceUrl,
        brand_kit_applied: visual.brandKitApplied,
        version: visual.version,
        created_at: visual.createdAt.toISOString(),
      });
    },
  );

  fastify.post<{ Params: { visualId: string }; Body: RegenerateVisualBody }>(
    '/visuals/:visualId/regenerate',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [visual] = await fastify.db
        .select()
        .from(visuals)
        .where(and(eq(visuals.id, request.params.visualId), eq(visuals.userId, request.user.id)))
        .limit(1);

      if (!visual) throw notFound('Visual', request.params.visualId);
      if (visual.status === 'regenerating') throw badRequest('Visual is already regenerating');

      await fastify.db
        .update(visuals)
        .set({ status: 'regenerating', updatedAt: new Date() })
        .where(eq(visuals.id, visual.id));

      const jobPayload: VisualRegenerationJobPayload = {
        job_type: 'visual_regeneration',
        user_id: request.user.id,
        visual_id: visual.id,
        content_package_id: visual.contentPackageId,
        instruction: request.body?.instruction,
        override_method: request.body?.generation_method,
      };

      const job = await fastify.queues['visual-generation'].add('visual_regeneration', jobPayload);

      return reply.status(202).send({
        visual_id: visual.id,
        status: 'regenerating',
        job_id: job.id,
      });
    },
  );
}
