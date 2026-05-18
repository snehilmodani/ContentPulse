import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Disable p-retry so tests don't wait for backoff delays
vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

import { UnsplashClient } from '../../src/adapters/unsplash';

describe('UnsplashClient — stub mode (no access key)', () => {
  it('returns picsum URL with photographer "Lorem Picsum"', async () => {
    const client = new UnsplashClient('');
    const result = await client.search('sunset photography');
    expect(result.url).toContain('picsum.photos');
    expect(result.photographer).toBe('Lorem Picsum');
    expect(result.source_url).toBe('https://picsum.photos');
  });

  it('encodes the query in the picsum seed URL', async () => {
    const client = new UnsplashClient('');
    const result = await client.search('nature walks');
    expect(result.url).toContain(encodeURIComponent('nature walks'));
  });
});

describe('UnsplashClient — real mode (with access key)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls Unsplash API and returns photo data', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              urls: { regular: 'https://images.unsplash.com/photo.jpg' },
              user: { name: 'Jane Doe' },
              links: { html: 'https://unsplash.com/@janedoe' },
            },
          ],
        }),
    });

    const client = new UnsplashClient('access-key-123');
    const result = await client.search('mountain landscape');

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('unsplash.com');
    expect(decodeURIComponent(url)).toContain('mountain landscape');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Client-ID access-key-123');
    expect(result.url).toBe('https://images.unsplash.com/photo.jpg');
    expect(result.photographer).toBe('Jane Doe');
    expect(result.source_url).toBe('https://unsplash.com/@janedoe');
  });

  it('throws when no results are returned', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
    const client = new UnsplashClient('access-key-123');
    await expect(client.search('very obscure query')).rejects.toThrow('No Unsplash result');
  });

  it('throws when API returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 403 });
    const client = new UnsplashClient('access-key-123');
    await expect(client.search('anything')).rejects.toThrow('403');
  });
});
