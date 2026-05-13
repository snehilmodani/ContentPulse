'use client';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { access_token: string; refresh_token: string };
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let token = localStorage.getItem('access_token');

  const makeRequest = async (authToken: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };

  let response = await makeRequest(token);

  if (response.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) {
      response = await makeRequest(token);
    }
  }

  if (!response.ok) {
    let errorData: { error?: { code?: string; message?: string } } = {};
    try {
      errorData = (await response.json()) as typeof errorData;
    } catch {
      // ignore
    }
    throw new ApiError(
      errorData.error?.code ?? 'UNKNOWN',
      errorData.error?.message ?? `HTTP ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = localStorage.getItem('access_token');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new ApiError(
      errorData.error?.code ?? 'UNKNOWN',
      errorData.error?.message ?? `HTTP ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}
