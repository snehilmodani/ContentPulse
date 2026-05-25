import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Disable p-retry so tests don't wait for backoff delays
vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

import { DalleClient, getDimensions } from '../../src/adapters/dalle';

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

describe('getDimensions', () => {
  it('returns correct dimensions for thumbnail', () => {
    expect(getDimensions('thumbnail')).toEqual({ width: 1280, height: 720 });
  });

  it('returns correct dimensions for square_post', () => {
    expect(getDimensions('square_post')).toEqual({ width: 1080, height: 1080 });
  });

  it('returns correct dimensions for story_cover', () => {
    expect(getDimensions('story_cover')).toEqual({ width: 1080, height: 1920 });
  });

  it('returns correct dimensions for carousel_slide', () => {
    expect(getDimensions('carousel_slide')).toEqual({ width: 1080, height: 1080 });
  });

  it('returns correct dimensions for x_header', () => {
    expect(getDimensions('x_header')).toEqual({ width: 1500, height: 500 });
  });

  it('falls back to 1080x1080 for unknown type', () => {
    expect(getDimensions('unknown' as any)).toEqual({ width: 1080, height: 1080 });
  });
});

describe('DalleClient — stub mode (no API key)', () => {
  it('returns a picsum URL derived from the prompt', async () => {
    const client = new DalleClient('', undefined, mockLogger);
    const result = await client.generate('AI in healthcare', 'square_post');
    expect(result.url).toContain('picsum.photos');
    expect(result.revisedPrompt).toBe('AI in healthcare');
  });

  it('encodes the prompt slug in the URL', async () => {
    const client = new DalleClient('', undefined, mockLogger);
    const result = await client.generate('hello world prompt', 'thumbnail');
    expect(result.url).toContain(encodeURIComponent('hello world prom'));
  });
});

describe('DalleClient — real mode (with API key)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls OpenRouter chat completions and returns url and revisedPrompt', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] } }],
        }),
    });

    const client = new DalleClient('sk-test-key', undefined, mockLogger);
    const result = await client.generate('futuristic city', 'square_post');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('openrouter.ai');
    expect(url).toContain('chat/completions');
    expect((opts.headers as Record<string, string>)['Authorization']).toContain('Bearer sk-test-key');
    const body = JSON.parse(opts.body as string);
    expect(body.modalities).toContain('image');
    expect(body.messages[0].content).toBe('futuristic city');
    expect(result.url).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(result.revisedPrompt).toBe('futuristic city');
  });

  it('throws when the API returns a non-ok status', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests', text: () => Promise.resolve('rate limit exceeded') });
    const client = new DalleClient('sk-test-key', undefined, mockLogger);
    await expect(client.generate('prompt', 'thumbnail')).rejects.toThrow('429');
  });

  it('throws when response has no image', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { images: [], content: 'sorry, no image' } }] }),
    });
    const client = new DalleClient('sk-test-key', undefined, mockLogger);
    await expect(client.generate('prompt', 'thumbnail')).rejects.toThrow('No image returned');
  });
});
