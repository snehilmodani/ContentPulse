DO $$ BEGIN
 CREATE TYPE "public"."angle_type" AS ENUM('news', 'innovation', 'contrarian', 'comedic', 'tangential_insight', 'how_to');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."branding_mode" AS ENUM('strict', 'flexible');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."draft_format" AS ENUM('x_thread', 'linkedin_article', 'linkedin_carousel', 'instagram_post', 'reel_script', 'blog_post');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."draft_status" AS ENUM('generating', 'draft', 'approved', 'rejected', 'regenerating');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."effort_estimate" AS ENUM('low', 'medium', 'high');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."idea_status" AS ENUM('pending', 'approved', 'rejected', 'deferred');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_channel" AS ENUM('email', 'push', 'in_app');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_event" AS ENUM('daily_digest_ready', 'package_ready', 'export_ready', 'trend_spike');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."package_status" AS ENUM('pending', 'researching', 'drafting', 'ready', 'approved', 'exported', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."published_platform" AS ENUM('x_twitter', 'linkedin', 'instagram', 'youtube');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'partial');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."trend_category" AS ENUM('breaking_news', 'innovation_launch', 'evergreen_timely', 'cultural_comedic', 'contrarian_provocative');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."trend_source" AS ENUM('x_twitter', 'google_trends', 'newsapi', 'reddit', 'youtube');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."visual_gen_method" AS ENUM('ai_dalle', 'web_unsplash', 'web_pexels', 'template');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."visual_status" AS ENUM('generating', 'ready', 'approved', 'regenerating');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."visual_type" AS ENUM('thumbnail', 'square_post', 'story_cover', 'carousel_slide', 'x_header');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supabase_uid" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"push_subscription" jsonb,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"push_notifications" boolean DEFAULT true NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabase_uid_unique" UNIQUE("supabase_uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"family" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"primary_domain" text NOT NULL,
	"sub_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_audience" text,
	"creator_persona" text,
	"tone_of_voice" text[] DEFAULT '{}'::text[] NOT NULL,
	"content_mix_ratio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"region" text DEFAULT 'IN-MH' NOT NULL,
	"inspiration_accounts" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_domain_profile_user" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logo_r2_key" text,
	"logo_url" text,
	"primary_colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"font_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"branding_mode" "branding_mode" DEFAULT 'flexible' NOT NULL,
	"extra_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_brand_kit_user" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"stage_timings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_trend_run_user_date" UNIQUE("user_id","run_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_platform" "trend_source" NOT NULL,
	"topic_name" text NOT NULL,
	"topic_slug" text NOT NULL,
	"category" "trend_category" NOT NULL,
	"relevance_score" numeric(4, 2) DEFAULT '0' NOT NULL,
	"trend_velocity" numeric(8, 2),
	"engagement_potential" numeric(4, 2),
	"regional_score" numeric(4, 2),
	"novelty_score" numeric(4, 2),
	"composite_score" numeric(5, 2),
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"topic_embedding" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid NOT NULL,
	"trend_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"angle_type" "angle_type" NOT NULL,
	"hook_line" text NOT NULL,
	"core_argument" text NOT NULL,
	"platform_fit" text[] DEFAULT '{}'::text[] NOT NULL,
	"effort_estimate" "effort_estimate" DEFAULT 'medium' NOT NULL,
	"relevance_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" "idea_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"generation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "package_status" DEFAULT 'pending' NOT NULL,
	"selected_formats" draft_format[] DEFAULT ARRAY['x_thread','linkedin_article','instagram_post','reel_script','blog_post']::draft_format[] NOT NULL,
	"pipeline_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"export_r2_key" text,
	"export_url" text,
	"export_url_expires_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_content_package_idea" UNIQUE("idea_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_summary" text NOT NULL,
	"key_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opposing_views" text,
	"regional_angle" text,
	"related_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fact_check_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_topic_brief_package" UNIQUE("content_package_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"format" "draft_format" NOT NULL,
	"status" "draft_status" DEFAULT 'generating' NOT NULL,
	"content_body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"regeneration_prompt" text,
	"generation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_draft_package_format" UNIQUE("content_package_id","format")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"visual_type" "visual_type" NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"generation_method" "visual_gen_method" NOT NULL,
	"status" "visual_status" DEFAULT 'generating' NOT NULL,
	"r2_key" text,
	"cdn_url" text,
	"prompt_used" text,
	"source_url" text,
	"brand_kit_applied" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "published_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "published_platform" NOT NULL,
	"draft_id" uuid,
	"external_post_id" text,
	"published_at" timestamp with time zone,
	"publish_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"followers_gained" integer DEFAULT 0 NOT NULL,
	"video_views" integer,
	"video_completion_rate" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" "notification_event" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain_profiles" ADD CONSTRAINT "domain_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_runs" ADD CONSTRAINT "trend_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trends" ADD CONSTRAINT "trends_trend_run_id_trend_runs_id_fk" FOREIGN KEY ("trend_run_id") REFERENCES "public"."trend_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trends" ADD CONSTRAINT "trends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_trend_run_id_trend_runs_id_fk" FOREIGN KEY ("trend_run_id") REFERENCES "public"."trend_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_briefs" ADD CONSTRAINT "topic_briefs_content_package_id_content_packages_id_fk" FOREIGN KEY ("content_package_id") REFERENCES "public"."content_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_briefs" ADD CONSTRAINT "topic_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_content_package_id_content_packages_id_fk" FOREIGN KEY ("content_package_id") REFERENCES "public"."content_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visuals" ADD CONSTRAINT "visuals_content_package_id_content_packages_id_fk" FOREIGN KEY ("content_package_id") REFERENCES "public"."content_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visuals" ADD CONSTRAINT "visuals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_content_package_id_content_packages_id_fk" FOREIGN KEY ("content_package_id") REFERENCES "public"."content_packages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_published_post_id_published_posts_id_fk" FOREIGN KEY ("published_post_id") REFERENCES "public"."published_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_supabase_uid" ON "users" USING btree ("supabase_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trend_runs_user_id" ON "trend_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trend_runs_run_date" ON "trend_runs" USING btree ("run_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trend_runs_status" ON "trend_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trends_trend_run_id" ON "trends" USING btree ("trend_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trends_composite_score" ON "trends" USING btree ("composite_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ideas_trend_run_id" ON "ideas" USING btree ("trend_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ideas_user_id" ON "ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ideas_status" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_packages_user_id" ON "content_packages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_packages_status" ON "content_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drafts_content_package_id" ON "drafts" USING btree ("content_package_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drafts_status" ON "drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" USING btree ("user_id");