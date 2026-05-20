import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

vi.mock('@alkalisummer/google-trends-js', () => ({
  default: { autocomplete: vi.fn() },
}));

import { GoogleTrendsClient } from '../../src/jobs/trend-harvesting/sources/google-trends';
import GoogleTrendsApi from '@alkalisummer/google-trends-js';

const mockAutocomplete = vi.mocked(GoogleTrendsApi.autocomplete);

describe('GoogleTrendsClient — stub mode (disabled)', () => {
  it('returns 4 stub trends containing the domain name', async () => {
    const client = new GoogleTrendsClient(false);
    const trends = await client.fetchTrends('AI tools', 'IN-MH');
    expect(trends).toHaveLength(4);
    trends.forEach((t) => {
      expect(t.topic_name).toContain('AI tools');
      expect(t.raw_data['stub']).toBe(true);
      expect(t.raw_data['source']).toBe('google_trends_stub');
    });
  });

  it('does not call GoogleTrendsApi in stub mode', async () => {
    const client = new GoogleTrendsClient(false);
    await client.fetchTrends('crypto', 'US');
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it('includes region in stub raw_data', async () => {
    const client = new GoogleTrendsClient(false);
    const trends = await client.fetchTrends('fintech', 'US-CA');
    trends.forEach((t) => {
      expect(t.raw_data['region']).toBe('US-CA');
    });
  });
});

describe('GoogleTrendsClient — real mode (enabled)', () => {
  beforeEach(() => {
    mockAutocomplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls autocomplete with domain and en-IN language for region IN-MH', async () => {
    mockAutocomplete.mockResolvedValue({ data: ['AI development', 'AI tools India'] });
    const client = new GoogleTrendsClient(true);
    await client.fetchTrends('AI', 'IN-MH');
    expect(mockAutocomplete).toHaveBeenCalledWith('AI', 'en-IN');
  });

  it('calls autocomplete with en-US language for region US-CA', async () => {
    mockAutocomplete.mockResolvedValue({ data: ['bitcoin price'] });
    const client = new GoogleTrendsClient(true);
    await client.fetchTrends('finance', 'US-CA');
    expect(mockAutocomplete).toHaveBeenCalledWith('finance', 'en-US');
  });

  it('calls autocomplete for primary domain and each sub-domain', async () => {
    mockAutocomplete.mockResolvedValue({ data: ['some suggestion'] });
    const client = new GoogleTrendsClient(true);
    await client.fetchTrends('AI', 'US', ['machine learning', 'LLMs']);
    expect(mockAutocomplete).toHaveBeenCalledTimes(3);
    expect(mockAutocomplete).toHaveBeenCalledWith('AI', 'en-US');
    expect(mockAutocomplete).toHaveBeenCalledWith('machine learning', 'en-US');
    expect(mockAutocomplete).toHaveBeenCalledWith('LLMs', 'en-US');
  });

  it('caps total calls at 5 keywords', async () => {
    mockAutocomplete.mockResolvedValue({ data: [] });
    const client = new GoogleTrendsClient(true);
    await client.fetchTrends('AI', 'US', ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(mockAutocomplete).toHaveBeenCalledTimes(5);
  });

  it('maps suggestions to RawTrend shape with source_keyword in raw_data', async () => {
    mockAutocomplete.mockResolvedValueOnce({ data: ['AI software 2024', 'AI tools for developers'] });
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('AI', 'IN');
    expect(trends[0]?.topic_name).toBe('AI software 2024');
    expect(trends[0]?.topic_slug).toBe('ai-software-2024');
    expect(trends[0]?.raw_data['geo']).toBe('IN');
    expect(trends[0]?.raw_data['source_keyword']).toBe('AI');
  });

  it('deduplicates suggestions across keywords', async () => {
    mockAutocomplete
      .mockResolvedValueOnce({ data: ['ai tools'] })
      .mockResolvedValueOnce({ data: ['ai tools', 'ml frameworks'] });
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('AI', 'US', ['machine learning']);
    const slugs = trends.map((t) => t.topic_slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(trends).toHaveLength(2);
  });

  it('truncates topic_slug to 60 characters', async () => {
    const long = 'A very long trending search query that exceeds sixty characters in total length';
    mockAutocomplete.mockResolvedValueOnce({ data: [long] });
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('tech', 'US');
    expect(trends[0]?.topic_slug.length).toBeLessThanOrEqual(60);
  });

  it('returns empty array when autocomplete returns empty data', async () => {
    mockAutocomplete.mockResolvedValue({ data: [] });
    const client = new GoogleTrendsClient(true);
    expect(await client.fetchTrends('tech', 'US')).toHaveLength(0);
  });

  it('returns empty array when autocomplete returns an error (error swallowed by allSettled)', async () => {
    mockAutocomplete.mockResolvedValueOnce({ error: { message: 'rate limit' } as never });
    const client = new GoogleTrendsClient(true);
    expect(await client.fetchTrends('tech', 'US')).toHaveLength(0);
  });

  it('falls back to stub when region is not a 2-letter ISO code', async () => {
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('AI', 'India');
    expect(trends.every((t) => t.raw_data['stub'] === true)).toBe(true);
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it('caps results at 10 across all keywords', async () => {
    mockAutocomplete.mockResolvedValue({ data: Array.from({ length: 8 }, (_, i) => `trend ${i}`) });
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('AI', 'US', ['ml']);
    expect(trends.length).toBeLessThanOrEqual(10);
  });

  it('respects cap parameter when provided', async () => {
    mockAutocomplete.mockResolvedValue({ data: Array.from({ length: 8 }, (_, i) => `trend ${i}`) });
    const client = new GoogleTrendsClient(true);
    const trends = await client.fetchTrends('AI', 'US', ['ml'], 3);
    expect(trends.length).toBe(3);
  });
});
