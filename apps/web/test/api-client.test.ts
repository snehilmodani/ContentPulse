import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiUpload } from '../lib/api-client';

// Per-test in-memory store so spy implementations stay wired up
let localStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStore[key]; }),
  clear: vi.fn(() => { localStore = {}; }),
  key: vi.fn((i: number) => Object.keys(localStore)[i] ?? null),
  get length() { return Object.keys(localStore).length; },
};

describe('ApiError', () => {
  it('is an instance of Error', () => {
    expect(new ApiError('NOT_FOUND', 'not found', 404) instanceof Error).toBe(true);
  });

  it('stores code, message, and status', () => {
    const err = new ApiError('BAD_REQUEST', 'invalid body', 400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('invalid body');
    expect(err.status).toBe(400);
    expect(err.name).toBe('ApiError');
  });
});

describe('apiFetch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStore = {};
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', localStorageMock);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a request without Authorization when no token is stored', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'hello' }),
    });

    await apiFetch('/health');

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('attaches Bearer token when access_token is in localStorage', async () => {
    localStorageMock.setItem('access_token', 'my-jwt-token');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    await apiFetch('/me');

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('sets Content-Type to application/json when body is provided', async () => {
    localStorageMock.setItem('access_token', 'token');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiFetch('/ideas/approve', { method: 'POST', body: JSON.stringify({ id: '1' }) });

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('does not set Content-Type when no body', async () => {
    localStorageMock.setItem('access_token', 'token');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiFetch('/me');

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('returns undefined for 204 No Content responses', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });
    const result = await apiFetch('/logout');
    expect(result).toBeUndefined();
  });

  it('parses and returns JSON body on success', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'pkg-1', status: 'draft' }),
    });

    const result = await apiFetch<{ id: string; status: string }>('/packages/pkg-1');
    expect(result.id).toBe('pkg-1');
    expect(result.status).toBe('draft');
  });

  it('refreshes the access token on 401 and retries the request', async () => {
    localStorageMock.setItem('access_token', 'expired-token');
    localStorageMock.setItem('refresh_token', 'valid-refresh');

    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'user-1' }),
      });

    const result = await apiFetch<{ id: string }>('/me');

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'new-access');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'new-refresh');
    expect(result.id).toBe('user-1');
  });

  it('throws ApiError when 401 and no refresh token is stored', async () => {
    localStorageMock.setItem('access_token', 'expired-token');

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
    });

    await expect(apiFetch('/protected')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('throws ApiError with UNKNOWN code when error body is missing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
    });

    await expect(apiFetch('/broken')).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 500,
    });
  });

  it('throws ApiError with server-provided error code', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'IDEA_NOT_FOUND', message: 'Idea not found' } }),
    });

    await expect(apiFetch('/ideas/bad-id')).rejects.toMatchObject({
      code: 'IDEA_NOT_FOUND',
      message: 'Idea not found',
      status: 404,
    });
  });

  it('includes custom headers alongside auth header', async () => {
    localStorageMock.setItem('access_token', 'tok');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await apiFetch('/data', { headers: { 'X-Request-ID': 'req-123' } });

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['X-Request-ID']).toBe('req-123');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });
});

describe('apiUpload', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStore = {};
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', localStorageMock);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends FormData with Authorization header when token exists', async () => {
    localStorageMock.setItem('access_token', 'upload-token');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://r2.example.com/logo.png' }),
    });

    const fd = new FormData();
    const result = await apiUpload<{ url: string }>('/brand-kit/logo', fd);

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/brand-kit/logo');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer upload-token');
    expect(result.url).toBe('https://r2.example.com/logo.png');
  });

  it('sends without Authorization header when no token', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await apiUpload('/public/upload', new FormData());

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('throws ApiError with server code on non-ok response', async () => {
    localStorageMock.setItem('access_token', 'tok');
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: () => Promise.resolve({ error: { code: 'FILE_TOO_LARGE', message: 'Max 10 MB' } }),
    });

    await expect(apiUpload('/upload', new FormData())).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: 413,
    });
  });
});
