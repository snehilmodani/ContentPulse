import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { angleTypeEnum, effortEstimateEnum, ideaStatusEnum } from '../enums';
import { trendRuns } from './trend_runs';
import { trends } from './trends';
import { users } from './users';

export const ideas = pgTable(
  'ideas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trendId: uuid('trend_id')
      .notNull()
      .references(() => trends.id, { onDelete: 'cascade' }),
    trendRunId: uuid('trend_run_id')
      .notNull()
      .references(() => trendRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    angleType: angleTypeEnum('angle_type').notNull(),
    hookLine: text('hook_line').notNull(),
    coreArgument: text('core_argument').notNull(),
    platformFit: text('platform_fit').array().notNull().default([]),
    effortEstimate: effortEstimateEnum('effort_estimate').notNull().default('medium'),
    relevanceScore: numeric('relevance_score', { precision: 5, scale: 2 }).notNull().default('0'),
    status: ideaStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    generationMeta: jsonb('generation_meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trendRunIdIdx: index('idx_ideas_trend_run_id').on(t.trendRunId),
    userIdIdx: index('idx_ideas_user_id').on(t.userId),
    statusIdx: index('idx_ideas_status').on(t.status),
  }),
);

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
