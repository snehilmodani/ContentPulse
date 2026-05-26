import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { brandKits, contentPackages, domainProfiles, ideas, trends, visuals } from '@contentpulse/db';
import type {
  GenerateExternalPromptResponse,
  RegenerateVisualBody,
  VisualRegenerationJobPayload,
} from '@contentpulse/types';
import type { AnthropicClient } from '@contentpulse/ai-client';
import { badRequest, notFound } from '../lib/errors';
import type { R2StorageClient } from '../lib/r2';

const VISUAL_ASPECT_RATIOS: Record<string, string> = {
  thumbnail:      '16:9 landscape',
  square_post:    '1:1 square',
  story_cover:    '9:16 portrait',
  carousel_slide: '1:1 square',
  x_header:       '3:1 ultra-wide',
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

function buildVisualResponse(visual: typeof visuals.$inferSelect) {
  return {
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
  };
}

export async function visualRoutes(fastify: FastifyInstance & { db: Db; r2: R2StorageClient; aiClient: AnthropicClient }) {
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

      return reply.send(buildVisualResponse(visual));
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
        ...(request.body?.instruction !== undefined ? { instruction: request.body.instruction } : {}),
        ...(request.body?.generation_method !== undefined ? { override_method: request.body.generation_method } : {}),
      };

      const job = await fastify.queues['visual-generation'].add('visual_regeneration', jobPayload);

      return reply.status(202).send({
        visual_id: visual.id,
        status: 'regenerating',
        job_id: job.id,
      });
    },
  );

  // POST /visuals/:visualId/prompt — generate a detailed external-image-gen prompt via Claude
  fastify.post<{ Params: { visualId: string } }>(
    '/visuals/:visualId/prompt',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const userId = request.user.id;

      const [visual] = await fastify.db
        .select()
        .from(visuals)
        .where(and(eq(visuals.id, request.params.visualId), eq(visuals.userId, userId)))
        .limit(1);

      if (!visual) throw notFound('Visual', request.params.visualId);

      // Gather context: package → idea → trend → domain profile → brand kit
      const [pkg] = await fastify.db
        .select()
        .from(contentPackages)
        .where(eq(contentPackages.id, visual.contentPackageId))
        .limit(1);

      const [idea] = pkg
        ? await fastify.db.select().from(ideas).where(eq(ideas.id, pkg.ideaId)).limit(1)
        : [undefined];

      const [trend] = idea
        ? await fastify.db.select().from(trends).where(eq(trends.id, idea.trendId)).limit(1)
        : [undefined];

      const [profile] = await fastify.db
        .select()
        .from(domainProfiles)
        .where(eq(domainProfiles.userId, userId))
        .limit(1);

      const [brandKit] = await fastify.db
        .select()
        .from(brandKits)
        .where(eq(brandKits.userId, userId))
        .limit(1);

      const aspectRatio = VISUAL_ASPECT_RATIOS[visual.visualType] ?? 'standard';
      const colors = brandKit?.primaryColors ?? [];
      const colorHint =
        colors.length > 0
          ? brandKit?.brandingMode === 'strict'
            ? `MUST incorporate these brand colors: ${colors.join(', ')}.`
            : `Optionally incorporate these brand colors: ${colors.join(', ')}.`
          : '';
      const toneHint =
        profile?.toneOfVoice?.length ? `Tone/style: ${profile.toneOfVoice.join(', ')}.` : '';
      const personaHint = profile?.creatorPersona
        ? `Creator persona: ${profile.creatorPersona}.`
        : '';

      const systemBlock = {
        text: `You are an expert image prompt engineer for frontier AI image generators (Gemini Imagen, Midjourney, Sora, FLUX, SDXL).

Output a single detailed image generation prompt — no explanation, no JSON, no markdown, no headers. The prompt should:
- Be 2-4 sentences or a rich comma-separated list of descriptors
- Specify the composition format in natural language (e.g. "wide landscape composition", "square format", "portrait phone screen orientation")
- Include: main subject, mood, lighting, composition, photographic or artistic style, color palette
- Exclude: embedded text, logos, watermarks, brand names, copyrighted characters
- Be specific enough that different generators produce consistent results

The output is intended for direct copy-paste into an image generator.`,
        cacheable: true,
      };

      const contextLines = [
        idea ? `Content idea: ${idea.hookLine}` : '',
        idea ? `Core argument: ${idea.coreArgument}` : '',
        trend?.topicName ? `Trend topic: ${trend.topicName}` : '',
        `Image type: ${visual.visualType.replace(/_/g, ' ')} — ${aspectRatio}`,
        colorHint,
        toneHint,
        personaHint,
        visual.promptUsed ? `Previously used prompt/query: ${visual.promptUsed}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const userMessage = `${contextLines}\n\nGenerate a single, detailed image generation prompt for this ${visual.visualType.replace(/_/g, ' ')} visual.`;

      const result = await fastify.aiClient.complete({
        userId,
        systemBlocks: [systemBlock],
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 512,
      });

      const prompt = result.text.startsWith('[STUB]')
        ? `Professional ${visual.visualType.replace(/_/g, ' ')} image for social media, ${aspectRatio} composition, clean modern aesthetic, vibrant colors, high quality photography`
        : result.text.trim();

      return reply.send({ prompt } satisfies GenerateExternalPromptResponse);
    },
  );

  // POST /visuals/:visualId/upload — replace the visual with a user-supplied image file
  fastify.post<{ Params: { visualId: string } }>(
    '/visuals/:visualId/upload',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const userId = request.user.id;

      const [visual] = await fastify.db
        .select()
        .from(visuals)
        .where(and(eq(visuals.id, request.params.visualId), eq(visuals.userId, userId)))
        .limit(1);

      if (!visual) throw notFound('Visual', request.params.visualId);

      const file = await request.file();
      if (!file) throw badRequest('No file provided');

      const ext = MIME_TO_EXT[file.mimetype];
      if (!ext) throw badRequest(`Unsupported file type ${file.mimetype}. Use JPEG, PNG, or WebP.`);

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer);
      }
      const buf = Buffer.concat(chunks);

      const newVersion = visual.version + 1;
      const key = `visuals/${userId}/${visual.contentPackageId}/${visual.visualType}-user-v${newVersion}-${Date.now()}.${ext}`;

      let cdnUrl: string;
      try {
        cdnUrl = await fastify.r2.upload(key, buf, file.mimetype);
      } catch (err) {
        fastify.log.error({ err, key }, 'R2 upload failed for user visual replacement');
        throw badRequest('Image upload failed — storage error. Please try again.');
      }

      const rows = await fastify.db
        .update(visuals)
        .set({
          status: 'ready',
          generationMethod: 'user_upload',
          r2Key: key,
          cdnUrl,
          sourceUrl: null,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(visuals.id, visual.id))
        .returning();

      const updated = rows[0] ?? { ...visual, status: 'ready' as const, generationMethod: 'user_upload' as const, r2Key: key, cdnUrl, sourceUrl: null, version: newVersion };
      return reply.send(buildVisualResponse(updated));
    },
  );
}
