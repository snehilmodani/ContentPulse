import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { brandKits, domainProfiles, users } from '@contentpulse/db';
import type {
  BrandKitResponse,
  DomainProfileResponse,
  UpsertBrandKitBody,
  UpsertDomainProfileBody,
} from '@contentpulse/types';
import { forbidden, notFound } from '../lib/errors';
import type { R2StorageClient } from '../lib/r2';

function toDomainProfileResponse(dp: typeof domainProfiles.$inferSelect): DomainProfileResponse {
  return {
    id: dp.id,
    user_id: dp.userId,
    primary_domain: dp.primaryDomain,
    sub_domains: dp.subDomains ?? [],
    target_audience: dp.targetAudience,
    creator_persona: dp.creatorPersona,
    tone_of_voice: dp.toneOfVoice ?? [],
    content_mix_ratio: (dp.contentMixRatio as Record<string, number>) ?? {},
    region: dp.region,
    inspiration_accounts: dp.inspirationAccounts ?? [],
    updated_at: dp.updatedAt.toISOString(),
  };
}

function toBrandKitResponse(bk: typeof brandKits.$inferSelect): BrandKitResponse {
  return {
    id: bk.id,
    user_id: bk.userId,
    logo_r2_key: bk.logoR2Key,
    logo_url: bk.logoUrl,
    primary_colors: bk.primaryColors ?? [],
    font_preferences: (bk.fontPreferences as Record<string, string>) ?? {},
    branding_mode: bk.brandingMode,
    extra_assets: (bk.extraAssets as unknown[]) ?? [],
    updated_at: bk.updatedAt.toISOString(),
  };
}

export async function userRoutes(
  fastify: FastifyInstance & { db: Db; r2: R2StorageClient },
) {
  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId/domain-profile',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const [dp] = await fastify.db
        .select()
        .from(domainProfiles)
        .where(eq(domainProfiles.userId, request.user.id))
        .limit(1);

      if (!dp) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Domain profile not yet created' } });

      return reply.send(toDomainProfileResponse(dp));
    },
  );

  fastify.put<{ Params: { userId: string }; Body: UpsertDomainProfileBody }>(
    '/users/:userId/domain-profile',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const body = request.body;
      const optionalDpFields = {
        ...(body.target_audience !== undefined ? { targetAudience: body.target_audience } : {}),
        ...(body.creator_persona !== undefined ? { creatorPersona: body.creator_persona } : {}),
        ...(body.region !== undefined ? { region: body.region } : {}),
      };
      const [dp] = await fastify.db
        .insert(domainProfiles)
        .values({
          userId: request.user.id,
          primaryDomain: body.primary_domain,
          subDomains: body.sub_domains ?? [],
          toneOfVoice: body.tone_of_voice ?? [],
          contentMixRatio: body.content_mix_ratio ?? {},
          inspirationAccounts: body.inspiration_accounts ?? [],
          ...optionalDpFields,
        })
        .onConflictDoUpdate({
          target: domainProfiles.userId,
          set: {
            primaryDomain: body.primary_domain,
            subDomains: body.sub_domains ?? [],
            toneOfVoice: body.tone_of_voice ?? [],
            contentMixRatio: body.content_mix_ratio ?? {},
            inspirationAccounts: body.inspiration_accounts ?? [],
            updatedAt: new Date(),
            ...optionalDpFields,
          },
        })
        .returning();

      // mark user onboarding complete
      await fastify.db
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(eq(users.id, request.user.id));

      if (!dp) throw new Error('Upsert failed');
      return reply.send(toDomainProfileResponse(dp));
    },
  );

  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId/brand-kit',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const [bk] = await fastify.db
        .select()
        .from(brandKits)
        .where(eq(brandKits.userId, request.user.id))
        .limit(1);

      if (!bk) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Brand kit not yet created' } });

      return reply.send(toBrandKitResponse(bk));
    },
  );

  fastify.put<{ Params: { userId: string }; Body: UpsertBrandKitBody }>(
    '/users/:userId/brand-kit',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const body = request.body;
      const [bk] = await fastify.db
        .insert(brandKits)
        .values({
          userId: request.user.id,
          primaryColors: body.primary_colors ?? [],
          fontPreferences: body.font_preferences ?? {},
          brandingMode: body.branding_mode ?? 'flexible',
          extraAssets: body.extra_assets ?? [],
        })
        .onConflictDoUpdate({
          target: brandKits.userId,
          set: {
            primaryColors: body.primary_colors ?? [],
            fontPreferences: body.font_preferences ?? {},
            brandingMode: body.branding_mode ?? 'flexible',
            extraAssets: body.extra_assets ?? [],
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!bk) throw new Error('Upsert failed');
      return reply.send(toBrandKitResponse(bk));
    },
  );

  fastify.patch<{
    Params: { userId: string };
    Body: { display_name?: string; timezone?: string; email_notifications?: boolean; push_notifications?: boolean };
  }>(
    '/users/:userId',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const { display_name, timezone, email_notifications, push_notifications } = request.body;
      const [updated] = await fastify.db
        .update(users)
        .set({
          ...(display_name !== undefined && { displayName: display_name }),
          ...(timezone !== undefined && { timezone }),
          ...(email_notifications !== undefined && { emailNotifications: email_notifications }),
          ...(push_notifications !== undefined && { pushNotifications: push_notifications }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.user.id))
        .returning();

      if (!updated) throw notFound('User', request.user.id);
      return reply.send({ id: updated.id, display_name: updated.displayName, timezone: updated.timezone });
    },
  );

  fastify.post<{ Params: { userId: string } }>(
    '/users/:userId/brand-kit/logo',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      if (request.params.userId !== request.user.id) throw forbidden();

      const data = await request.file();
      if (!data) throw new Error('No file uploaded');

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      const key = `brand/${request.user.id}/logo-${Date.now()}.${data.filename.split('.').pop() ?? 'png'}`;
      const url = await fastify.r2.upload(key, buffer, data.mimetype);

      await fastify.db
        .update(brandKits)
        .set({ logoR2Key: key, logoUrl: url, updatedAt: new Date() })
        .where(eq(brandKits.userId, request.user.id));

      return reply.send({ logo_url: url, r2_key: key });
    },
  );
}
