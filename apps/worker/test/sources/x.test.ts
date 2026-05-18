import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Disable p-retry so tests don't wait for backoff delays
vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

import { XTrendsClient } from '../../src/jobs/trend-harvesting/sources/x';

const makeTweet = (overrides: Partial<{
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  lang: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  hashtags: string[];
}> = {}) => ({
  id: overrides.id ?? 'tweet-1',
  text: overrides.text ?? 'Hello world',
  author_id: overrides.author_id ?? 'user-1',
  created_at: overrides.created_at ?? '2024-06-01T10:00:00Z',
  lang: overrides.lang ?? 'en',
  public_metrics: {
    like_count: overrides.likes ?? 100,
    retweet_count: overrides.retweets ?? 50,
    reply_count: overrides.replies ?? 20,
    quote_count: overrides.quotes ?? 10,
    impression_count: 5000,
  },
  entities: {
    hashtags: (overrides.hashtags ?? []).map((tag) => ({ tag })),
    urls: [],
  },
});

describe('XTrendsClient — stub mode (no bearer token)', () => {
  it('returns 5 stub trends with correct slug format', async () => {
    const client = new XTrendsClient('');
    const trends = await client.fetchTrends('SaaS', 'US');
    expect(trends).toHaveLength(5);
    trends.forEach((t) => {
      expect(t.topic_slug).toMatch(/^x-saas-trend-\d+$/);
      expect((t.raw_data as any)['stub']).toBe(true);
    });
  });

  it('includes domain name in topic slugs', async () => {
    const client = new XTrendsClient('');
    const trends = await client.fetchTrends('machine learning', 'IN');
    trends.forEach((t) => {
      expect(t.topic_slug).toContain('machine-learning');
    });
  });
});

describe('XTrendsClient — real mode (with bearer token)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends correct Authorization header', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { result_count: 0 } }),
    });

    const client = new XTrendsClient('BEARER_TOKEN_ABC');
    await client.fetchTrends('fintech', 'US');

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer BEARER_TOKEN_ABC');
  });

  it('builds correct search query with domain', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { result_count: 0 } }),
    });

    const client = new XTrendsClient('token');
    await client.fetchTrends('Web3', 'US');

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('Web3');
    expect(decodeURIComponent(url)).toContain('-is:retweet');
    expect(decodeURIComponent(url)).toContain('-is:reply');
  });

  it('sorts tweets by engagement (likes + 2×retweets + quotes + replies) descending', async () => {
    const lowEngagement = makeTweet({ id: '001', text: 'Low tweet', likes: 10, retweets: 5, replies: 1, quotes: 1 });
    const highEngagement = makeTweet({ id: '002', text: 'High tweet', likes: 500, retweets: 200, replies: 50, quotes: 30 });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [lowEngagement, highEngagement],
          includes: { users: [] },
          meta: { result_count: 2 },
        }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('AI', 'US');

    expect(trends[0]?.raw_data).toMatchObject({ tweet_id: '002' });
    expect(trends[1]?.raw_data).toMatchObject({ tweet_id: '001' });
  });

  it('caps results at 5 tweets', async () => {
    const tweets = Array.from({ length: 20 }, (_, i) =>
      makeTweet({ id: `tweet-${i}`, text: `Tweet ${i}` }),
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: tweets, includes: { users: [] } }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('tech', 'US');
    expect(trends).toHaveLength(5);
  });

  it('prefixes topic name with hashtag when present', async () => {
    const tweet = makeTweet({ id: 't1', text: 'Check out this article about AI', hashtags: ['AITools'] });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [tweet], includes: { users: [] } }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('AI', 'US');
    expect(trends[0]?.topic_name).toMatch(/^#AITools/);
  });

  it('strips URLs and @mentions from topic name', async () => {
    const tweet = makeTweet({
      id: 't1',
      text: 'Great thread @johndoe https://example.com/article on machine learning',
      hashtags: [],
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [tweet], includes: { users: [] } }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('AI', 'US');
    const name = trends[0]?.topic_name ?? '';
    expect(name).not.toContain('@johndoe');
    expect(name).not.toContain('https://');
  });

  it('includes author metadata when users are provided', async () => {
    const tweet = makeTweet({ id: 't1', author_id: 'user-42' });
    const users = [{ id: 'user-42', username: 'techwriter', public_metrics: { followers_count: 12000 } }];

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [tweet], includes: { users } }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('AI', 'US');
    const raw = trends[0]?.raw_data as any;
    expect(raw.author_username).toBe('techwriter');
    expect(raw.author_followers).toBe(12000);
  });

  it('appends last 6 chars of tweet id to the slug', async () => {
    const tweet = makeTweet({ id: '1234567890', text: 'Some topic' });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [tweet], includes: { users: [] } }),
    });

    const client = new XTrendsClient('token');
    const trends = await client.fetchTrends('tech', 'US');
    expect(trends[0]?.topic_slug).toMatch(/-567890$/);
  });

  it('throws on non-ok API response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Rate limit exceeded'),
    });
    const client = new XTrendsClient('token');
    await expect(client.fetchTrends('AI', 'US')).rejects.toThrow('429');
  });
});
