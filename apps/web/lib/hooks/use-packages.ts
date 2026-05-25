'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import type {
  ApproveDraftResponse,
  ContentPackageResponse,
  DraftResponse,
  ExportResponse,
  PackageVisualsResponse,
  RegenerateDraftBody,
  RegenerateDraftResponse,
  RegenerateVisualBody,
  RegenerateVisualResponse,
  RejectDraftResponse,
  TopicBriefResponse,
} from '@contentpulse/types';

export function usePackagesList() {
  return useQuery<{ data: Array<{ id: string; status: string; hook_line: string | null; created_at: string; updated_at: string }> }>({
    queryKey: ['packages'],
    queryFn: () => apiFetch('/content-packages'),
  });
}

export function usePackage(packageId: string) {
  return useQuery<ContentPackageResponse>({
    queryKey: ['packages', packageId],
    queryFn: () => apiFetch<ContentPackageResponse>(`/content-packages/${packageId}`),
    enabled: !!packageId,
    refetchInterval: (data) => {
      if (!data) return false;
      const status = data.state.data?.status;
      return status === 'pending' || status === 'researching' || status === 'drafting' ? 5000 : false;
    },
  });
}

export function usePackageBrief(packageId: string, enabled = true) {
  return useQuery<TopicBriefResponse>({
    queryKey: ['packages', packageId, 'brief'],
    queryFn: () => apiFetch<TopicBriefResponse>(`/content-packages/${packageId}/brief`),
    enabled: !!packageId && enabled,
  });
}

export function usePackageDrafts(packageId: string, pollWhileDrafting = false) {
  return useQuery<{ data: DraftResponse[] }>({
    queryKey: ['packages', packageId, 'drafts'],
    queryFn: () => apiFetch<{ data: DraftResponse[] }>(`/content-packages/${packageId}/drafts`),
    enabled: !!packageId,
    refetchInterval: (query) => {
      if (pollWhileDrafting) return 3000;
      if (query.state.data?.data?.some((d) => d.status === 'regenerating')) return 3000;
      return false;
    },
  });
}

const TERMINAL_PKG_STATUSES = new Set(['ready', 'approved', 'exported']);

export function usePackageVisuals(packageId: string, pollWhileDrafting = false, packageStatus?: string) {
  return useQuery<PackageVisualsResponse>({
    queryKey: ['packages', packageId, 'visuals'],
    queryFn: () => apiFetch<PackageVisualsResponse>(`/content-packages/${packageId}/visuals`),
    enabled: !!packageId,
    refetchInterval: (query) => {
      if (packageStatus && TERMINAL_PKG_STATUSES.has(packageStatus)) return false;
      if (pollWhileDrafting) return 3000;
      const stillWorking = query.state.data?.data?.some(
        (v) => v.status === 'generating' || v.status === 'regenerating',
      );
      return stillWorking ? 3000 : false;
    },
  });
}

export function useApproveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      apiFetch<ApproveDraftResponse>(`/drafts/${draftId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

export function useRejectDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, reason }: { draftId: string; reason?: string }) =>
      apiFetch<typeof rejectDraftResponse>(`/drafts/${draftId}/reject`, {
        method: 'POST',
        body: JSON.stringify(reason !== undefined ? { reason } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['packages'] }),
  });
}

const rejectDraftResponse = {} as RejectDraftResponse;

export function useRegenerateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, instruction }: { draftId: string; instruction: string }) =>
      apiFetch<RegenerateDraftResponse>(`/drafts/${draftId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ instruction } satisfies RegenerateDraftBody),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['packages'] }),
  });
}

export function useRegenerateVisual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ visualId, body }: { visualId: string; body: RegenerateVisualBody }) =>
      apiFetch<RegenerateVisualResponse>(`/visuals/${visualId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['packages'] }),
  });
}

export function useExportPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) =>
      apiFetch<ExportResponse>(`/content-packages/${packageId}/export`, { method: 'POST' }),
    onSuccess: (_data, packageId) => {
      void queryClient.invalidateQueries({ queryKey: ['packages', packageId] });
    },
  });
}
