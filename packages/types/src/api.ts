import type {
  AngleType,
  BrandingMode,
  DraftFormat,
  DraftStatus,
  EffortEstimate,
  IdeaStatus,
  NotificationChannel,
  NotificationEvent,
  PackageStatus,
  RunStatus,
  TrendCategory,
  TrendSource,
  VisualGenMethod,
  VisualStatus,
  VisualType,
} from './enums';

// ─── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface AuthResponse {
  user: MeResponse;
  session: AuthSession;
}

export interface MeResponse {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  onboarding_complete: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  created_at: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  display_name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RefreshBody {
  refresh_token: string;
}

// ─── Domain Profile ───────────────────────────────────────────────────────────

export interface DomainProfileResponse {
  id: string;
  user_id: string;
  primary_domain: string;
  sub_domains: string[];
  target_audience: string | null;
  creator_persona: string | null;
  tone_of_voice: string[];
  content_mix_ratio: Record<string, number>;
  region: string;
  inspiration_accounts: string[];
  updated_at: string;
}

export interface UpsertDomainProfileBody {
  primary_domain: string;
  sub_domains?: string[];
  target_audience?: string;
  creator_persona?: string;
  tone_of_voice?: string[];
  content_mix_ratio?: Record<string, number>;
  region?: string;
  inspiration_accounts?: string[];
}

// ─── Brand Kit ────────────────────────────────────────────────────────────────

export interface BrandKitResponse {
  id: string;
  user_id: string;
  logo_r2_key: string | null;
  logo_url: string | null;
  primary_colors: string[];
  font_preferences: Record<string, string>;
  branding_mode: BrandingMode;
  extra_assets: unknown[];
  updated_at: string;
}

export interface UpsertBrandKitBody {
  primary_colors?: string[];
  font_preferences?: Record<string, string>;
  branding_mode?: BrandingMode;
  extra_assets?: unknown[];
}

export interface UploadLogoResponse {
  logo_url: string;
  r2_key: string;
}

// ─── Trend Runs ───────────────────────────────────────────────────────────────

export interface TrendRunListItem {
  id: string;
  run_date: string;
  status: RunStatus;
  trend_count: number;
  idea_count: number;
  pending_idea_count: number;
}

export interface TrendSummary {
  id: string;
  topic_name: string;
  category: TrendCategory;
  composite_score: string;
  idea_count: number;
}

export interface TrendRunDetail {
  id: string;
  run_date: string;
  status: RunStatus;
  stage_timings: Record<string, unknown>;
  trends: TrendSummary[];
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

export interface TrendContext {
  id: string;
  topic_name: string;
  topic_slug: string;
  category: TrendCategory;
  source_platform: TrendSource;
  composite_score: string;
}

export interface IdeaListItem {
  id: string;
  trend: TrendContext | null;
  angle_type: AngleType;
  hook_line: string;
  platform_fit: string[];
  relevance_score: string;
  status: IdeaStatus;
}

export interface IdeaResponse {
  id: string;
  trend: TrendContext;
  angle_type: AngleType;
  hook_line: string;
  core_argument: string;
  platform_fit: string[];
  effort_estimate: EffortEstimate;
  relevance_score: string;
  status: IdeaStatus;
  rejection_reason: string | null;
  generation_meta: Record<string, unknown>;
  created_at: string;
}

export interface ApproveIdeaResponse {
  idea_id: string;
  status: 'approved';
  content_package: {
    id: string;
    status: 'pending';
  };
}

export interface RejectIdeaBody {
  reason?: string;
}

export interface RejectIdeaResponse {
  idea_id: string;
  status: 'rejected';
}

export interface DeferIdeaResponse {
  idea_id: string;
  status: 'deferred';
}

// ─── Content Packages ─────────────────────────────────────────────────────────

export interface ContentPackageResponse {
  id: string;
  idea_id: string;
  user_id: string;
  status: PackageStatus;
  selected_formats: DraftFormat[];
  pipeline_progress: Record<string, unknown>;
  export_url: string | null;
  export_url_expires_at: string | null;
  draft_count: number;
  visual_count: number;
  approved_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Topic Brief ──────────────────────────────────────────────────────────────

export interface KeyFact {
  fact: string;
  source_url: string;
  confidence: number;
}

export interface TimelineEvent {
  date: string;
  event: string;
}

export interface KeyPlayer {
  name: string;
  role: string;
  org: string;
}

export interface BriefSource {
  title: string;
  url: string;
  publication: string;
  published_at: string;
}

export interface FactCheckFlag {
  claim: string;
  flag: string;
  note: string;
}

export interface TopicBriefResponse {
  id: string;
  content_package_id: string;
  topic_summary: string;
  key_facts: KeyFact[];
  timeline: TimelineEvent[];
  key_players: KeyPlayer[];
  opposing_views: string | null;
  regional_angle: string | null;
  related_topics: string[];
  sources: BriefSource[];
  fact_check_flags: FactCheckFlag[];
  research_meta: Record<string, unknown>;
  created_at: string;
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export interface DraftResponse {
  id: string;
  content_package_id: string;
  format: DraftFormat;
  status: DraftStatus;
  content_body: Record<string, unknown>;
  version: number;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  generation_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RegenerateDraftBody {
  instruction: string;
}

export interface RegenerateDraftResponse {
  draft_id: string;
  status: 'regenerating';
  job_id: string;
}

export interface ApproveDraftResponse {
  draft_id: string;
  status: 'approved';
  approved_at: string;
}

export interface RejectDraftBody {
  reason?: string;
}

export interface RejectDraftResponse {
  draft_id: string;
  status: 'rejected';
}

// ─── Visuals ──────────────────────────────────────────────────────────────────

export interface VisualResponse {
  id: string;
  content_package_id: string;
  visual_type: VisualType;
  width_px: number;
  height_px: number;
  generation_method: VisualGenMethod;
  status: VisualStatus;
  r2_key: string | null;
  cdn_url: string | null;
  prompt_used: string | null;
  source_url: string | null;
  brand_kit_applied: boolean;
  version: number;
  created_at: string;
}

export type PackageVisualsResponse = { data: VisualResponse[] };

export interface RegenerateVisualBody {
  instruction?: string;
  generation_method?: VisualGenMethod;
}

export interface RegenerateVisualResponse {
  visual_id: string;
  status: 'regenerating';
  job_id: string;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportResponse {
  package_id: string;
  status: 'exporting';
  job_id: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationResponse {
  id: string;
  user_id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  sent_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface NotificationsListResponse {
  data: NotificationResponse[];
  unread_count: number;
}

export interface PushSubscribeBody {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

export interface MarkReadResponse {
  notification_id: string;
  read_at: string;
}
