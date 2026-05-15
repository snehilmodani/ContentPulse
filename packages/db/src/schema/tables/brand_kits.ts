import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { brandingModeEnum } from '../enums';
import { users } from './users';

export const brandKits = pgTable(
  'brand_kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    logoR2Key: text('logo_r2_key'),
    logoUrl: text('logo_url'),
    primaryColors: text('primary_colors').array().notNull().default(sql`'{}'::text[]`),
    fontPreferences: jsonb('font_preferences').notNull().default({}),
    brandingMode: brandingModeEnum('branding_mode').notNull().default('flexible'),
    extraAssets: jsonb('extra_assets').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqBrandKitUser: unique('uq_brand_kit_user').on(t.userId),
  }),
);

export type BrandKit = typeof brandKits.$inferSelect;
export type NewBrandKit = typeof brandKits.$inferInsert;
