import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {
    readonly name = 'AbortError';
  },
}));

import { PerplexityClient } from '../../src/adapters/perplexity';

describe('PerplexityClient — stub mode (no API key)', () => {
  it('returns deterministic stub research data without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = new PerplexityClient('');
    const result = await client.research('AI in healthcare', 'IN-MH');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.topic_summary).toContain('AI in healthcare');
    expect(result.topic_summary).toContain('IN-MH');
    expect(Array.isArray(result.key_facts)).toBe(true);
    expect(Array.isArray(result.sources)).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('PerplexityClient — real mode (with API key)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  const validResearch = {
    topic_summary: 'AI is transforming healthcare',
    key_facts: [{ fact: 'AI diagnoses faster', source_url: 'https://example.com', confidence: 0.9 }],
    timeline: [{ date: '2024-01-01', event: 'Study published' }],
    key_players: [{ name: 'Dr. Smith', role: 'Researcher', org: 'MIT' }],
    opposing_views: 'Some disagree',
    regional_angle: 'India specific',
    related_topics: ['ML', 'diagnostics'],
    sources: [{ title: 'Study', url: 'https://example.com', publication: 'Nature', published_at: '2024-01-01' }],
    fact_check_flags: [],
  };

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls OpenRouter API with correct Authorization header', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(validResearch) } }],
      }),
    });

    const client = new PerplexityClient('pplx_test_key');
    await client.research('AI in healthcare', 'IN-MH');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer pplx_test_key');
  });

  it('parses response into { summary, key_facts, sources } shape', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(validResearch) } }],
      }),
    });

    const client = new PerplexityClient('pplx_test_key');
    const result = await client.research('AI in healthcare', 'IN-MH');

    expect(result.topic_summary).toBe(validResearch.topic_summary);
    expect(result.key_facts).toHaveLength(1);
    expect(result.sources).toHaveLength(1);
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });

    const client = new PerplexityClient('pplx_test_key');
    await expect(client.research('AI', 'IN-MH')).rejects.toThrow('500');
  });

  it('throws AbortError on 4xx non-429 responses (not retried)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('forbidden'),
    });

    const client = new PerplexityClient('pplx_test_key');
    const err = await client.research('AI', 'IN-MH').catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err.message).toContain('403');
  });

  it('throws AbortError when response body fails schema validation', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ wrong_key: 'data_without_topic_summary' }) } }],
      }),
    });

    const client = new PerplexityClient('pplx_test_key');
    const err = await client.research('AI', 'IN-MH').catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(err.message).toContain('schema validation');
  });
});
