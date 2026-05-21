import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { runStatusEnum } from '../enums';
import { users } from './users';

export const trendRuns = pgTable(
  'trend_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runDate: date('run_date').notNull(),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: runStatusEnum('status').notNull().default('pending'),
    stageTimings: jsonb('stage_timings').notNull().default({}),
    domainSnapshot: jsonb('domain_snapshot').notNull().default({}),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('idx_trend_runs_user_id').on(t.userId),
    runDateIdx: index('idx_trend_runs_run_date').on(t.runDate),
    statusIdx: index('idx_trend_runs_status').on(t.status),
  }),
);

export type TrendRun = typeof trendRuns.$inferSelect;
export type NewTrendRun = typeof trendRuns.$inferInsert;
