import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { draftFormatEnum, packageStatusEnum } from '../enums';
import { ideas } from './ideas';
import { users } from './users';

export const contentPackages = pgTable(
  'content_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ideaId: uuid('idea_id')
      .notNull()
      .references(() => ideas.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: packageStatusEnum('status').notNull().default('pending'),
    selectedFormats: draftFormatEnum('selected_formats')
      .array()
      .notNull()
      .default(['x_thread', 'linkedin_article', 'instagram_post', 'reel_script', 'blog_post']),
    pipelineProgress: jsonb('pipeline_progress').notNull().default({}),
    exportR2Key: text('export_r2_key'),
    exportUrl: text('export_url'),
    exportUrlExpiresAt: timestamp('export_url_expires_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqContentPackageIdea: unique('uq_content_package_idea').on(t.ideaId),
    userIdIdx: index('idx_content_packages_user_id').on(t.userId),
    statusIdx: index('idx_content_packages_status').on(t.status),
  }),
);

export type ContentPackage = typeof contentPackages.$inferSelect;
export type NewContentPackage = typeof contentPackages.$inferInsert;
