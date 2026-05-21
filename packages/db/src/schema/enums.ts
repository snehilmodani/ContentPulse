import { pgEnum } from 'drizzle-orm/pg-core';

export const ideaStatusEnum = pgEnum('idea_status', [
  'pending',
  'approved',
  'rejected',
  'deferred',
]);

export const draftFormatEnum = pgEnum('draft_format', [
  'x_thread',
  'linkedin_article',
  'linkedin_carousel',
  'instagram_post',
  'reel_script',
  'blog_post',
]);

export const draftStatusEnum = pgEnum('draft_status', [
  'generating',
  'draft',
  'approved',
  'rejected',
  'regenerating',
]);

export const visualTypeEnum = pgEnum('visual_type', [
  'thumbnail',
  'square_post',
  'story_cover',
  'carousel_slide',
  'x_header',
]);

export const visualGenMethodEnum = pgEnum('visual_gen_method', [
  'ai_dalle',
  'web_unsplash',
  'web_pexels',
  'template',
]);

export const visualStatusEnum = pgEnum('visual_status', [
  'generating',
  'ready',
  'approved',
  'regenerating',
]);

export const trendCategoryEnum = pgEnum('trend_category', [
  'breaking_news',
  'innovation_launch',
  'evergreen_timely',
  'cultural_comedic',
  'contrarian_provocative',
]);

export const trendSourceEnum = pgEnum('trend_source', [
  'x_twitter',
  'google_trends',
  'newsapi',
  'reddit',
  'youtube',
]);

export const runStatusEnum = pgEnum('run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'partial',
]);

export const packageStatusEnum = pgEnum('package_status', [
  'pending',
  'researching',
  'drafting',
  'ready',
  'approved',
  'exported',
  'rejected',
]);

export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'push', 'in_app']);

export const notificationEventEnum = pgEnum('notification_event', [
  'daily_digest_ready',
  'package_ready',
  'export_ready',
  'trend_spike',
]);

export const brandingModeEnum = pgEnum('branding_mode', ['strict', 'flexible']);

export const angleTypeEnum = pgEnum('angle_type', [
  'news',
  'innovation',
  'contrarian',
  'comedic',
  'tangential_insight',
  'how_to',
]);

export const effortEstimateEnum = pgEnum('effort_estimate', ['low', 'medium', 'high']);

export const publishedPlatformEnum = pgEnum('published_platform', [
  'x_twitter',
  'linkedin',
  'instagram',
  'youtube',
  'blog_post',
]);
