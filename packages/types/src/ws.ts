export type WSEventName =
  | 'pipeline_stage_started'
  | 'pipeline_stage_completed'
  | 'pipeline_stage_failed'
  | 'ideas_ready'
  | 'package_ready'
  | 'export_ready'
  | 'draft_regenerated'
  | 'visual_regenerated';

export interface PipelineStageStartedData {
  trend_run_id?: string;
  content_package_id?: string;
  stage: string;
}

export interface PipelineStageCompletedData {
  trend_run_id?: string;
  content_package_id?: string;
  stage: string;
  duration_ms: number;
}

export interface PipelineStageFailedData {
  trend_run_id?: string;
  content_package_id?: string;
  stage: string;
  error_code: string;
  message: string;
}

export interface IdeasReadyData {
  trend_run_id: string;
  idea_count: number;
}

export interface PackageReadyData {
  content_package_id: string;
  draft_count: number;
  visual_count: number;
}

export interface ExportReadyData {
  content_package_id: string;
  export_url: string;
  expires_at: string;
}

export interface DraftRegeneratedData {
  draft_id: string;
  content_package_id: string;
  version: number;
}

export interface VisualRegeneratedData {
  visual_id: string;
  content_package_id: string;
  version: number;
}

export type WSEventData =
  | PipelineStageStartedData
  | PipelineStageCompletedData
  | PipelineStageFailedData
  | IdeasReadyData
  | PackageReadyData
  | ExportReadyData
  | DraftRegeneratedData
  | VisualRegeneratedData;

export interface WSEnvelope {
  event: WSEventName;
  data: WSEventData;
  timestamp: string;
}
