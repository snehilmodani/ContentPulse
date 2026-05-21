import type { DraftFormat, NotificationEvent, VisualGenMethod, VisualType } from './enums';

export interface TrendHarvestingJobPayload {
  job_type: 'trend_harvesting';
  user_id: string;
  trend_run_id: string;
  domain_profile: {
    primary_domain: string;
    sub_domains: string[];
    region: string;
    tone_of_voice: string[];
  };
  sources: Array<'x_twitter' | 'google_trends' | 'newsapi' | 'reddit' | 'youtube'>;
  scheduled_for: string;
  trend_cap?: number;
}

export interface IdeaGenerationJobPayload {
  job_type: 'idea_generation';
  user_id: string;
  trend_run_id: string;
  trend_ids: string[];
  domain_profile_id: string;
  ideas_per_trend: 5;
}

export interface ResearchBriefJobPayload {
  job_type: 'research_brief';
  user_id: string;
  content_package_id: string;
  idea_id: string;
  idea: {
    hook_line: string;
    core_argument: string;
    angle_type: string;
    platform_fit: string[];
  };
  domain_profile: {
    primary_domain: string;
    region: string;
  };
}

export interface ContentDraftingJobPayload {
  job_type: 'content_drafting';
  user_id: string;
  content_package_id: string;
  topic_brief_id: string;
  idea_id: string;
  selected_formats: DraftFormat[];
  domain_profile: {
    tone_of_voice: string[];
    creator_persona: string;
    content_mix_ratio: Record<string, number>;
  };
  brand_kit: {
    branding_mode: 'strict' | 'flexible';
  };
}

export interface VisualGenerationJobPayload {
  job_type: 'visual_generation';
  user_id: string;
  content_package_id: string;
  idea_id: string;
  instagram_draft_id?: string;
  trend_category: string;
  visual_types: VisualType[];
  brand_kit: {
    logo_r2_key: string | null;
    primary_colors: string[];
    branding_mode: 'strict' | 'flexible';
  };
}

export interface ExportPackageJobPayload {
  job_type: 'export_package';
  user_id: string;
  content_package_id: string;
  approved_draft_ids: string[];
  approved_visual_ids: string[];
}

export interface NotificationSendJobPayload {
  job_type: 'notification_send';
  user_id: string;
  notification_id: string;
  event: NotificationEvent;
  channels: Array<'email' | 'push'>;
  template_data: Record<string, unknown>;
}

export interface DraftRegenerationJobPayload {
  job_type: 'draft_regeneration';
  user_id: string;
  draft_id: string;
  content_package_id: string;
  format: string;
  instruction: string;
  topic_brief_id: string;
}

export interface VisualRegenerationJobPayload {
  job_type: 'visual_regeneration';
  user_id: string;
  visual_id: string;
  content_package_id: string;
  instruction?: string;
  override_method?: VisualGenMethod;
}

export type JobPayload =
  | TrendHarvestingJobPayload
  | IdeaGenerationJobPayload
  | ResearchBriefJobPayload
  | ContentDraftingJobPayload
  | VisualGenerationJobPayload
  | ExportPackageJobPayload
  | NotificationSendJobPayload
  | DraftRegenerationJobPayload
  | VisualRegenerationJobPayload;
