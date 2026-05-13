import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { contentPackages } from './content_packages';
import { users } from './users';

export const topicBriefs = pgTable(
  'topic_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentPackageId: uuid('content_package_id')
      .notNull()
      .references(() => contentPackages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicSummary: text('topic_summary').notNull(),
    keyFacts: jsonb('key_facts').notNull().default([]),
    timeline: jsonb('timeline').notNull().default([]),
    keyPlayers: jsonb('key_players').notNull().default([]),
    opposingViews: text('opposing_views'),
    regionalAngle: text('regional_angle'),
    relatedTopics: text('related_topics').array().notNull().default([]),
    sources: jsonb('sources').notNull().default([]),
    factCheckFlags: jsonb('fact_check_flags').notNull().default([]),
    researchMeta: jsonb('research_meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTopicBriefPackage: unique('uq_topic_brief_package').on(t.contentPackageId),
  }),
);

export type TopicBrief = typeof topicBriefs.$inferSelect;
export type NewTopicBrief = typeof topicBriefs.$inferInsert;
