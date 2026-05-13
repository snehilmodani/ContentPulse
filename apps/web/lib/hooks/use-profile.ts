'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '../api-client';
import { useAuthStore } from '../stores/auth';
import type {
  BrandKitResponse,
  DomainProfileResponse,
  UploadLogoResponse,
  UpsertBrandKitBody,
  UpsertDomainProfileBody,
} from '@contentpulse/types';

export function useDomainProfile() {
  const { user } = useAuthStore();
  return useQuery<DomainProfileResponse>({
    queryKey: ['domain-profile', user?.id],
    queryFn: () => apiFetch<DomainProfileResponse>(`/users/${user!.id}/domain-profile`),
    enabled: !!user,
    retry: false,
  });
}

export function useUpsertDomainProfile() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertDomainProfileBody) =>
      apiFetch<DomainProfileResponse>(`/users/${user!.id}/domain-profile`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['domain-profile'] }),
  });
}

export function useBrandKit() {
  const { user } = useAuthStore();
  return useQuery<BrandKitResponse>({
    queryKey: ['brand-kit', user?.id],
    queryFn: () => apiFetch<BrandKitResponse>(`/users/${user!.id}/brand-kit`),
    enabled: !!user,
    retry: false,
  });
}

export function useUpsertBrandKit() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertBrandKitBody) =>
      apiFetch<BrandKitResponse>(`/users/${user!.id}/brand-kit`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['brand-kit'] }),
  });
}

export function useUploadLogo() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      return apiUpload<UploadLogoResponse>(`/users/${user!.id}/brand-kit/logo`, formData);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['brand-kit'] }),
  });
}
