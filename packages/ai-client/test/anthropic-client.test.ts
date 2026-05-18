import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {
    readonly name = 'AbortError';
    constructor(msg?: string) { super(msg); }
  },
}));

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => {
  class APIConnectionTimeoutError extends Error {
    readonly name = 'APIConnectionTimeoutError';
  }
  class APIError extends Error {
    status: number;
    headers: Record<string, string>;
    constructor(msg: string, opts: { status: number; headers?: Record<string, string> } = { status: 500 }) {
      super(msg);
      this.name = 'APIError';
      this.status = opts.status;
      this.headers = opts.headers ?? {};
    }
  }
  const OpenAI = vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  (OpenAI as any).APIConnectionTimeoutError = APIConnectionTimeoutError;
  (OpenAI as any).APIError = APIError;
  return { default: OpenAI };
});

import OpenAI from 'openai';
import { AnthropicClient, AiTimeoutError, AiRateLimitError, TokenBudgetExceededError } from '../src/index';

function makeRedis(usedTokens = 0) {
  const pipeline = {
    incrby: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, usedTokens + 100]]),
  };
  return {
    get: vi.fn().mockResolvedValue(String(usedTokens)),
    pipeline: vi.fn().mockReturnValue(pipeline),
    _pipeline: pipeline,
  } as any;
}

const completeOpts = {
  userId: 'u1',
  systemBlocks: [{ text: 'You are a helpful assistant.', cacheable: false }],
  messages: [{ role: 'user' as const, content: 'Write a tweet about AI' }],
};

const mockResponse = {
  choices: [{ message: { content: 'Great tweet content' } }],
  usage: { prompt_tokens: 50, completion_tokens: 30 },
};

describe('AnthropicClient — stub mode (no apiKey)', () => {
  it('returns stub text and zero token counts without calling OpenAI', async () => {
    const redis = makeRedis();
    const client = new AnthropicClient('', redis);

    const result = await client.complete(completeOpts);

    expect(result.text).toContain('[STUB]');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('preview text is derived from last user message content', async () => {
    const redis = makeRedis();
    const client = new AnthropicClient('', redis);

    const result = await client.complete({
      ...completeOpts,
      messages: [{ role: 'user', content: 'Generate ideas for my blog post about climate change' }],
    });

    expect(result.text).toContain('Generate ideas for my blog post about');
  });
});

describe('AnthropicClient — token budget', () => {
  it('throws TokenBudgetExceededError when Redis used >= cap', async () => {
    const redis = makeRedis(1_000_000);
    const client = new AnthropicClient('sk-test', redis, undefined, 1_000_000);

    await expect(client.complete(completeOpts)).rejects.toThrow(TokenBudgetExceededError);
  });

  it('budget key format is tok:<userId>:<YYYY-MM>', async () => {
    const redis = makeRedis(0);
    mockCreate.mockResolvedValueOnce(mockResponse);
    const client = new AnthropicClient('sk-test', redis);

    await client.complete(completeOpts);

    const budgetKey = redis.get.mock.calls[0]![0] as string;
    expect(budgetKey).toMatch(/^tok:u1:\d{4}-\d{2}$/);
  });
});

describe('AnthropicClient — successful real call', () => {
  let redis: ReturnType<typeof makeRedis>;
  let client: AnthropicClient;

  beforeEach(() => {
    redis = makeRedis(0);
    client = new AnthropicClient('sk-test', redis);
    mockCreate.mockResolvedValueOnce(mockResponse);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('returns { text, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }', async () => {
    const result = await client.complete(completeOpts);

    expect(result.text).toBe('Great tweet content');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(30);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it('calls pipeline INCRBY + EXPIRE on budget key after successful call', async () => {
    await client.complete(completeOpts);

    expect(redis._pipeline.incrby).toHaveBeenCalledWith(expect.stringMatching(/^tok:/), 80);
    expect(redis._pipeline.expire).toHaveBeenCalledWith(
      expect.stringMatching(/^tok:/),
      35 * 24 * 60 * 60,
    );
    expect(redis._pipeline.exec).toHaveBeenCalled();
  });
});

describe('AnthropicClient — error handling', () => {
  let redis: ReturnType<typeof makeRedis>;
  let client: AnthropicClient;

  beforeEach(() => {
    redis = makeRedis(0);
    client = new AnthropicClient('sk-test', redis);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('throws AiTimeoutError on APIConnectionTimeoutError', async () => {
    mockCreate.mockRejectedValueOnce(new (OpenAI as any).APIConnectionTimeoutError('timeout'));

    await expect(client.complete(completeOpts)).rejects.toThrow(AiTimeoutError);
  });

  it('throws AiRateLimitError on 429', async () => {
    // Pass retry-after: '0' so the wait is 0ms (avoids a 15s real timeout)
    mockCreate.mockRejectedValueOnce(
      new (OpenAI as any).APIError('rate limited', { status: 429, headers: { 'retry-after': '0' } }),
    );

    await expect(client.complete(completeOpts)).rejects.toThrow(AiRateLimitError);
  });

  it('throws AiTimeoutError on 408', async () => {
    mockCreate.mockRejectedValueOnce(new (OpenAI as any).APIError('request timeout', { status: 408 }));

    await expect(client.complete(completeOpts)).rejects.toThrow(AiTimeoutError);
  });

  it('throws AiTimeoutError on 504', async () => {
    mockCreate.mockRejectedValueOnce(new (OpenAI as any).APIError('gateway timeout', { status: 504 }));

    await expect(client.complete(completeOpts)).rejects.toThrow(AiTimeoutError);
  });

  it('throws AbortError on 4xx non-rate-limit (pRetry does not retry)', async () => {
    mockCreate.mockRejectedValueOnce(new (OpenAI as any).APIError('bad request', { status: 400 }));

    await expect(client.complete(completeOpts)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws original error on 5xx (retryable by pRetry)', async () => {
    const err = new (OpenAI as any).APIError('server error', { status: 500 });
    mockCreate.mockRejectedValueOnce(err);

    await expect(client.complete(completeOpts)).rejects.toThrow('server error');
  });
});
