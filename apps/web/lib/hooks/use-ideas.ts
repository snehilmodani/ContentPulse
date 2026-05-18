'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import type {
  ApproveIdeaResponse,
  DeferIdeaResponse,
  Paginated,
  RejectIdeaResponse,
  TrendRunDetail,
  TrendRunListItem,
} from '@contentpulse/types';

export function useTrendRuns(page = 1) {
  return useQuery<Paginated<TrendRunListItem>>({
    queryKey: ['trend-runs', page],
    queryFn: () => apiFetch<Paginated<TrendRunListItem>>(`/trend-runs?page=${page}&limit=20`),
  });
}

export function useTrendRun(runId: string) {
  return useQuery<TrendRunDetail>({
    queryKey: ['trend-run', runId],
    queryFn: () => apiFetch<TrendRunDetail>(`/trend-runs/${runId}`),
    enabled: !!runId,
  });
}

export function useTrendRunIdeas(runId: string, page = 1) {
  return useQuery({
    queryKey: ['trend-run-ideas', runId, page],
    queryFn: () => apiFetch(`/trend-runs/${runId}/ideas?page=${page}&limit=20`),
    enabled: !!runId,
  });
}

export function useApproveIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) =>
      apiFetch<ApproveIdeaResponse>(`/ideas/${ideaId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trend-run-ideas'] });
      void queryClient.invalidateQueries({ queryKey: ['trend-runs'] });
      void queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

export function useRejectIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, reason }: { ideaId: string; reason?: string }) =>
      apiFetch<RejectIdeaResponse>(`/ideas/${ideaId}/reject`, {
        method: 'POST',
        body: JSON.stringify(reason !== undefined ? { reason } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trend-run-ideas'] }),
  });
}

export function useDeferIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) =>
      apiFetch<DeferIdeaResponse>(`/ideas/${ideaId}/defer`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trend-run-ideas'] }),
  });
}
