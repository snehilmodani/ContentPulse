ALTER TABLE "trend_runs" DROP CONSTRAINT "uq_trend_run_user_date";--> statement-breakpoint
ALTER TABLE "domain_profiles" ALTER COLUMN "sub_domains" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "domain_profiles" ALTER COLUMN "tone_of_voice" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "domain_profiles" ALTER COLUMN "inspiration_accounts" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "brand_kits" ALTER COLUMN "primary_colors" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "ideas" ALTER COLUMN "platform_fit" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "content_packages" ALTER COLUMN "selected_formats" SET DEFAULT ARRAY['x_thread','linkedin_article','instagram_post','reel_script','blog_post']::draft_format[];--> statement-breakpoint
ALTER TABLE "topic_briefs" ALTER COLUMN "related_topics" SET DEFAULT '{}'::text[];