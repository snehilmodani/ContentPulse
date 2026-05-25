import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { contentPackages, drafts, ideas, topicBriefs, trends, visuals } from '@contentpulse/db';
import type { ExportPackageJobPayload, ResearchBriefJobPayload } from '@contentpulse/types';
import { notFound } from '../lib/errors';

export async function packageRoutes(fastify: FastifyInstance & { db: Db }) {
  fastify.get(
    '/content-packages',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const rows = await fastify.db
        .select({
          id: contentPackages.id,
          status: contentPackages.status,
          createdAt: contentPackages.createdAt,
          updatedAt: contentPackages.updatedAt,
          hookLine: ideas.hookLine,
        })
        .from(contentPackages)
        .leftJoin(ideas, eq(contentPackages.ideaId, ideas.id))
        .where(eq(contentPackages.userId, request.user.id))
        .orderBy(desc(contentPackages.createdAt));

      return reply.send({
        data: rows.map((r) => ({
          id: r.id,
          status: r.status,
          hook_line: r.hookLine ?? null,
          created_at: r.createdAt.toISOString(),
          updated_at: r.updatedAt.toISOString(),
        })),
      });
    },
  );

  fastify.get<{ Params: { packageId: string } }>(
    '/content-packages/:packageId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [row] = await fastify.db
        .select({
          pkg: contentPackages,
          hookLine: ideas.hookLine,
          coreArgument: ideas.coreArgument,
        })
        .from(contentPackages)
        .leftJoin(ideas, eq(contentPackages.ideaId, ideas.id))
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!row) throw notFound('ContentPackage', request.params.packageId);
      const { pkg, hookLine, coreArgument } = row;

      const draftCountRows = await fastify.db.select({ draftCount: count() }).from(drafts).where(eq(drafts.contentPackageId, pkg.id));
      const draftCount = draftCountRows[0]?.draftCount ?? 0;

      const visualCountRows = await fastify.db.select({ visualCount: count() }).from(visuals).where(eq(visuals.contentPackageId, pkg.id));
      const visualCount = visualCountRows[0]?.visualCount ?? 0;

      return reply.send({
        id: pkg.id,
        idea_id: pkg.ideaId,
        hook_line: hookLine ?? null,
        core_argument: coreArgument ?? null,
        user_id: pkg.userId,
        status: pkg.status,
        selected_formats: pkg.selectedFormats,
        pipeline_progress: pkg.pipelineProgress,
        export_url: pkg.exportUrl,
        export_url_expires_at: pkg.exportUrlExpiresAt?.toISOString() ?? null,
        draft_count: draftCount ?? 0,
        visual_count: visualCount ?? 0,
        approved_at: pkg.approvedAt?.toISOString() ?? null,
        exported_at: pkg.exportedAt?.toISOString() ?? null,
        created_at: pkg.createdAt.toISOString(),
        updated_at: pkg.updatedAt.toISOString(),
      });
    },
  );

  fastify.get<{ Params: { packageId: string } }>(
    '/content-packages/:packageId/brief',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [pkg] = await fastify.db
        .select({ id: contentPackages.id })
        .from(contentPackages)
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!pkg) throw notFound('ContentPackage', request.params.packageId);

      const [brief] = await fastify.db
        .select()
        .from(topicBriefs)
        .where(eq(topicBriefs.contentPackageId, pkg.id))
        .limit(1);

      if (!brief) throw notFound('TopicBrief', pkg.id);

      return reply.send({
        id: brief.id,
        content_package_id: brief.contentPackageId,
        topic_summary: brief.topicSummary,
        key_facts: brief.keyFacts,
        timeline: brief.timeline,
        key_players: brief.keyPlayers,
        opposing_views: brief.opposingViews,
        regional_angle: brief.regionalAngle,
        related_topics: brief.relatedTopics,
        sources: brief.sources,
        fact_check_flags: brief.factCheckFlags,
        research_meta: brief.researchMeta,
        created_at: brief.createdAt.toISOString(),
      });
    },
  );

  fastify.get<{ Params: { packageId: string } }>(
    '/content-packages/:packageId/drafts',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [pkg] = await fastify.db
        .select({ id: contentPackages.id })
        .from(contentPackages)
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!pkg) throw notFound('ContentPackage', request.params.packageId);

      const draftList = await fastify.db
        .select()
        .from(drafts)
        .where(eq(drafts.contentPackageId, pkg.id));

      return reply.send({
        data: draftList.map((d) => ({
          id: d.id,
          format: d.format,
          status: d.status,
          content_body: d.contentBody,
          generation_meta: d.generationMeta,
          version: d.version,
          approved_at: d.approvedAt?.toISOString() ?? null,
          rejected_at: d.rejectedAt?.toISOString() ?? null,
          rejection_reason: d.rejectionReason,
          created_at: d.createdAt.toISOString(),
          updated_at: d.updatedAt.toISOString(),
        })),
      });
    },
  );

  fastify.get<{ Params: { packageId: string } }>(
    '/content-packages/:packageId/visuals',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [pkg] = await fastify.db
        .select({ id: contentPackages.id })
        .from(contentPackages)
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!pkg) throw notFound('ContentPackage', request.params.packageId);

      const visualList = await fastify.db
        .select()
        .from(visuals)
        .where(eq(visuals.contentPackageId, pkg.id));

      return reply.send({
        data: visualList.map((v) => ({
          id: v.id,
          content_package_id: v.contentPackageId,
          visual_type: v.visualType,
          width_px: v.widthPx,
          height_px: v.heightPx,
          generation_method: v.generationMethod,
          status: v.status,
          r2_key: v.r2Key,
          cdn_url: v.cdnUrl,
          prompt_used: v.promptUsed,
          source_url: v.sourceUrl,
          brand_kit_applied: v.brandKitApplied,
          version: v.version,
          created_at: v.createdAt.toISOString(),
        })),
      });
    },
  );

  fastify.post<{ Params: { packageId: string } }>(
    '/content-packages/:packageId/research',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [pkg] = await fastify.db
        .select()
        .from(contentPackages)
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!pkg) throw notFound('ContentPackage', request.params.packageId);

      const [idea] = await fastify.db
        .select()
        .from(ideas)
        .where(eq(ideas.id, pkg.ideaId))
        .limit(1);

      if (!idea) throw notFound('Idea', pkg.ideaId);

      const [trend] = await fastify.db
        .select()
        .from(trends)
        .where(eq(trends.id, idea.trendId))
        .limit(1);

      // Clear existing brief so the unique constraint doesn't block re-research
      await fastify.db
        .delete(topicBriefs)
        .where(eq(topicBriefs.contentPackageId, pkg.id));

      await fastify.db
        .update(contentPackages)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(contentPackages.id, pkg.id));

      const jobPayload: ResearchBriefJobPayload = {
        job_type: 'research_brief',
        user_id: request.user.id,
        content_package_id: pkg.id,
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

      const job = await fastify.queues['research-brief'].add('research_brief', jobPayload);

      return reply.status(202).send({
        package_id: pkg.id,
        status: 'pending',
        job_id: job.id,
      });
    },
  );

  fastify.post<{ Params: { packageId: string } }>(
    '/content-packages/:packageId/export',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [pkg] = await fastify.db
        .select()
        .from(contentPackages)
        .where(
          and(
            eq(contentPackages.id, request.params.packageId),
            eq(contentPackages.userId, request.user.id),
          ),
        )
        .limit(1);

      if (!pkg) throw notFound('ContentPackage', request.params.packageId);

      const approvedDrafts = await fastify.db
        .select({ id: drafts.id })
        .from(drafts)
        .where(and(eq(drafts.contentPackageId, pkg.id), eq(drafts.status, 'approved')));

      const approvedVisuals = await fastify.db
        .select({ id: visuals.id })
        .from(visuals)
        .where(and(eq(visuals.contentPackageId, pkg.id), eq(visuals.status, 'approved')));

      const jobPayload: ExportPackageJobPayload = {
        job_type: 'export_package',
        user_id: request.user.id,
        content_package_id: pkg.id,
        approved_draft_ids: approvedDrafts.map((d) => d.id),
        approved_visual_ids: approvedVisuals.map((v) => v.id),
      };

      const job = await fastify.queues['export-package'].add('export_package', jobPayload);

      return reply.status(202).send({
        package_id: pkg.id,
        status: 'exporting',
        job_id: job.id,
      });
    },
  );
}
