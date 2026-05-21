'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import type {
  ApproveIdeaResponse,
  CreateTrendRunBody,
  DeferIdeaResponse,
  IdeaListItem,
  IdeaResponse,
  Paginated,
  RejectIdeaResponse,
  TrendRunDetail,
  TrendRunListItem,
  UpdateIdeaBody,
} from '@contentpulse/types';

export function useTrendRuns(page = 1) {
  return useQuery<Paginated<TrendRunListItem>>({
    queryKey: ['trend-runs', page],
    queryFn: () => apiFetch<Paginated<TrendRunListItem>>(`/trend-runs?page=${page}&limit=20`),
    refetchInterval: (query) => {
      const hasActiveRun = query.state.data?.data.some(
        (r) => r.status === 'pending' || r.status === 'running',
      );
      return hasActiveRun ? 4000 : false;
    },
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
  return useQuery<Paginated<IdeaListItem>>({
    queryKey: ['trend-run-ideas', runId, page],
    queryFn: () => apiFetch<Paginated<IdeaListItem>>(`/trend-runs/${runId}/ideas?page=${page}&limit=20`),
    enabled: !!runId,
  });
}

export function useIdea(ideaId: string | null) {
  return useQuery<IdeaResponse>({
    queryKey: ['idea', ideaId],
    queryFn: () => apiFetch<IdeaResponse>(`/ideas/${ideaId}`),
    enabled: !!ideaId,
  });
}

export function useUpdateIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, body }: { ideaId: string; body: UpdateIdeaBody }) =>
      apiFetch<IdeaResponse>(`/ideas/${ideaId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['idea', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['trend-run-ideas'] });
    },
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

export function useCreateTrendRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTrendRunBody) =>
      apiFetch<{ id: string; status: string; run_date: string }>(
        `/trend-runs`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trend-runs'] }),
  });
}
