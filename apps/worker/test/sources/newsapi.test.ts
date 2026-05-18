import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Disable p-retry so tests don't wait for backoff delays
vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

import { NewsApiClient } from '../../src/jobs/trend-harvesting/sources/newsapi';

describe('NewsApiClient — stub mode (no API key)', () => {
  it('returns 5 stub trends for the given domain', async () => {
    const client = new NewsApiClient('');
    const trends = await client.fetchTrends('AI tools', 'US');
    expect(trends).toHaveLength(5);
    trends.forEach((t, i) => {
      expect(t.topic_name).toContain('AI tools');
      expect(t.topic_slug).toContain(`trend-${i + 1}`);
      expect(t.raw_data['stub']).toBe(true);
    });
  });

  it('includes region parameter without error', async () => {
    const client = new NewsApiClient('');
    await expect(client.fetchTrends('crypto', 'IN')).resolves.toHaveLength(5);
  });
});

describe('NewsApiClient — real mode (with API key)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleArticles = [
    {
      title: 'AI Startup Raises $500M',
      url: 'https://news.example.com/ai-startup',
      publishedAt: '2024-06-01T12:00:00Z',
      source: { name: 'Tech News' },
    },
    {
      title: 'Bitcoin hits all-time high',
      url: 'https://news.example.com/btc',
      publishedAt: '2024-06-01T11:00:00Z',
      source: { name: 'Finance Daily' },
    },
  ];

  it('maps articles to RawTrend shape', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ articles: sampleArticles }),
    });

    const client = new NewsApiClient('newsapi-key-123');
    const trends = await client.fetchTrends('AI', 'US');

    expect(trends).toHaveLength(2);
    expect(trends[0]?.topic_name).toBe('AI Startup Raises $500M');
    expect(trends[0]?.topic_slug).toMatch(/^ai-startup-raises/);
    expect(trends[0]?.raw_data['source']).toBe('Tech News');
    expect(trends[0]?.raw_data['url']).toContain('ai-startup');
  });

  it('includes domain and API key in the request URL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ articles: [] }),
    });

    const client = new NewsApiClient('my-key');
    await client.fetchTrends('blockchain', 'US');

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('newsapi.org');
    expect(url).toContain('blockchain');
    expect(url).toContain('my-key');
  });

  it('truncates topic_slug to 60 characters', async () => {
    const longTitle = 'A very long article title that exceeds sixty characters in total length yes';
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ articles: [{ title: longTitle, url: 'u', publishedAt: 'p', source: { name: 's' } }] }),
    });

    const client = new NewsApiClient('key');
    const trends = await client.fetchTrends('test', 'US');
    expect(trends[0]?.topic_slug.length).toBeLessThanOrEqual(60);
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401 });
    const client = new NewsApiClient('bad-key');
    await expect(client.fetchTrends('tech', 'US')).rejects.toThrow('401');
  });
});
