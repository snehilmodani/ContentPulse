import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const domainProfiles = pgTable(
  'domain_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    primaryDomain: text('primary_domain').notNull(),
    subDomains: text('sub_domains').array().notNull().default(sql`'{}'::text[]`),
    targetAudience: text('target_audience'),
    creatorPersona: text('creator_persona'),
    toneOfVoice: text('tone_of_voice').array().notNull().default(sql`'{}'::text[]`),
    contentMixRatio: jsonb('content_mix_ratio').notNull().default({}),
    region: text('region').notNull().default('IN-MH'),
    inspirationAccounts: text('inspiration_accounts').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqDomainProfileUser: unique('uq_domain_profile_user').on(t.userId),
  }),
);

export type DomainProfile = typeof domainProfiles.$inferSelect;
export type NewDomainProfile = typeof domainProfiles.$inferInsert;
