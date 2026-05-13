import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supabaseUid: text('supabase_uid').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    pushSubscription: jsonb('push_subscription'),
    emailNotifications: boolean('email_notifications').notNull().default(true),
    pushNotifications: boolean('push_notifications').notNull().default(true),
    onboardingComplete: boolean('onboarding_complete').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    supabaseUidIdx: index('idx_users_supabase_uid').on(t.supabaseUid),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
