export type IdeaStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export type DraftFormat =
  | 'x_thread'
  | 'linkedin_article'
  | 'linkedin_carousel'
  | 'instagram_post'
  | 'reel_script'
  | 'blog_post';

export type DraftStatus = 'generating' | 'draft' | 'approved' | 'rejected' | 'regenerating';

export type VisualType =
  | 'thumbnail'
  | 'square_post'
  | 'story_cover'
  | 'carousel_slide'
  | 'x_header';

export type VisualGenMethod = 'ai_dalle' | 'web_unsplash' | 'web_pexels' | 'template' | 'user_upload';

export type VisualStatus = 'generating' | 'ready' | 'approved' | 'regenerating';

export type TrendCategory =
  | 'breaking_news'
  | 'innovation_launch'
  | 'evergreen_timely'
  | 'cultural_comedic'
  | 'contrarian_provocative';

export type TrendSource = 'x_twitter' | 'google_trends' | 'newsapi' | 'reddit' | 'youtube';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export type PackageStatus =
  | 'pending'
  | 'researching'
  | 'drafting'
  | 'ready'
  | 'approved'
  | 'exported'
  | 'rejected';

export type NotificationChannel = 'email' | 'push' | 'in_app';

export type NotificationEvent =
  | 'daily_digest_ready'
  | 'package_ready'
  | 'export_ready'
  | 'trend_spike';

export type BrandingMode = 'strict' | 'flexible';

export type AngleType =
  | 'news'
  | 'innovation'
  | 'contrarian'
  | 'comedic'
  | 'tangential_insight'
  | 'how_to';

export type EffortEstimate = 'low' | 'medium' | 'high';

export type PublishedPlatform = 'x_twitter' | 'linkedin' | 'instagram' | 'youtube' | 'blog_post';
