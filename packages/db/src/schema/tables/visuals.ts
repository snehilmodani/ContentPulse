import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { visualGenMethodEnum, visualStatusEnum, visualTypeEnum } from '../enums';
import { contentPackages } from './content_packages';
import { users } from './users';

export const visuals = pgTable('visuals', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentPackageId: uuid('content_package_id')
    .notNull()
    .references(() => contentPackages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  visualType: visualTypeEnum('visual_type').notNull(),
  widthPx: integer('width_px').notNull(),
  heightPx: integer('height_px').notNull(),
  generationMethod: visualGenMethodEnum('generation_method').notNull(),
  status: visualStatusEnum('status').notNull().default('generating'),
  r2Key: text('r2_key'),
  cdnUrl: text('cdn_url'),
  promptUsed: text('prompt_used'),
  sourceUrl: text('source_url'),
  brandKitApplied: boolean('brand_kit_applied').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Visual = typeof visuals.$inferSelect;
export type NewVisual = typeof visuals.$inferInsert;
