import { bigint, integer, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { publishedPosts } from './published_posts';
import { users } from './users';

export const postAnalytics = pgTable('post_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  publishedPostId: uuid('published_post_id')
    .notNull()
    .references(() => publishedPosts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
  impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
  reach: bigint('reach', { mode: 'number' }).notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  followersGained: integer('followers_gained').notNull().default(0),
  videoViews: integer('video_views'),
  videoCompletionRate: numeric('video_completion_rate', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PostAnalytics = typeof postAnalytics.$inferSelect;
export type NewPostAnalytics = typeof postAnalytics.$inferInsert;
