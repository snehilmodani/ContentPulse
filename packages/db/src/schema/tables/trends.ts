import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { trendCategoryEnum, trendSourceEnum } from '../enums';
import { trendRuns } from './trend_runs';
import { users } from './users';

export const trends = pgTable(
  'trends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trendRunId: uuid('trend_run_id')
      .notNull()
      .references(() => trendRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourcePlatform: trendSourceEnum('source_platform').notNull(),
    topicName: text('topic_name').notNull(),
    topicSlug: text('topic_slug').notNull(),
    category: trendCategoryEnum('category').notNull(),
    relevanceScore: numeric('relevance_score', { precision: 4, scale: 2 }).notNull().default('0'),
    trendVelocity: numeric('trend_velocity', { precision: 8, scale: 2 }),
    engagementPotential: numeric('engagement_potential', { precision: 4, scale: 2 }),
    regionalScore: numeric('regional_score', { precision: 4, scale: 2 }),
    noveltyScore: numeric('novelty_score', { precision: 4, scale: 2 }),
    compositeScore: numeric('composite_score', { precision: 5, scale: 2 }),
    rawData: jsonb('raw_data').notNull().default({}),
    topicEmbedding: text('topic_embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trendRunIdIdx: index('idx_trends_trend_run_id').on(t.trendRunId),
    compositeScoreIdx: index('idx_trends_composite_score').on(t.compositeScore),
  }),
);

export type Trend = typeof trends.$inferSelect;
export type NewTrend = typeof trends.$inferInsert;
