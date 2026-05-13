import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { publishedPlatformEnum } from '../enums';
import { contentPackages } from './content_packages';
import { drafts } from './drafts';
import { users } from './users';

export const publishedPosts = pgTable('published_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentPackageId: uuid('content_package_id')
    .notNull()
    .references(() => contentPackages.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: publishedPlatformEnum('platform').notNull(),
  draftId: uuid('draft_id').references(() => drafts.id),
  externalPostId: text('external_post_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishMeta: jsonb('publish_meta').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PublishedPost = typeof publishedPosts.$inferSelect;
export type NewPublishedPost = typeof publishedPosts.$inferInsert;
