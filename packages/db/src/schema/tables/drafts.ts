import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { draftFormatEnum, draftStatusEnum } from '../enums';
import { contentPackages } from './content_packages';
import { users } from './users';

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentPackageId: uuid('content_package_id')
      .notNull()
      .references(() => contentPackages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    format: draftFormatEnum('format').notNull(),
    status: draftStatusEnum('status').notNull().default('generating'),
    contentBody: jsonb('content_body').notNull().default({}),
    regenerationPrompt: text('regeneration_prompt'),
    generationMeta: jsonb('generation_meta').notNull().default({}),
    version: integer('version').notNull().default(1),
    previousVersions: jsonb('previous_versions').notNull().default([]),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqDraftPackageFormat: unique('uq_draft_package_format').on(t.contentPackageId, t.format),
    contentPackageIdIdx: index('idx_drafts_content_package_id').on(t.contentPackageId),
    statusIdx: index('idx_drafts_status').on(t.status),
  }),
);

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
