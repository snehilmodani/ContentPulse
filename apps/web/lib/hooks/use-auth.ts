'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuthStore } from '../stores/auth';
import type { AuthResponse, LoginBody, MeResponse, RegisterBody } from '@contentpulse/types';

export function useMe() {
  const { accessToken } = useAuthStore();
  return useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/auth/me'),
    enabled: !!accessToken,
    retry: false,
  });
}

export function useRegister() {
  const { setAuth } = useAuthStore();
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => setAuth(data.user, data.session.access_token, data.session.refresh_token),
  });
}

export function useLogin() {
  const { setAuth } = useAuthStore();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => setAuth(data.user, data.session.access_token, data.session.refresh_token),
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearAuth();
      queryClient.clear();
    },
  });
}
