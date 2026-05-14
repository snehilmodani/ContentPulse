import OpenAI from 'openai';
import type { Redis } from 'ioredis';
import pRetry, { AbortError } from 'p-retry';
import { AiRateLimitError, AiTimeoutError, TokenBudgetExceededError } from './errors';

export { AiRateLimitError, AiTimeoutError, TokenBudgetExceededError };

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const DEFAULT_TOKEN_CAP = 1_000_000;

export interface SystemBlock {
  text: string;
  cacheable: boolean;
}

export interface CompleteOptions {
  userId: string;
  systemBlocks: SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  model?: string;
}

export interface CompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export class AnthropicClient {
  private readonly client: OpenAI | null;
  private readonly redis: Redis;
  private readonly tokenCap: number;
  readonly defaultModel: string;

  constructor(apiKey: string, redis: Redis, defaultModel = FALLBACK_MODEL, tokenCap = DEFAULT_TOKEN_CAP) {
    this.redis = redis;
    this.tokenCap = tokenCap;
    this.defaultModel = defaultModel;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: {
            'HTTP-Referer': 'https://contentpulse.app',
            'X-Title': 'ContentPulse',
          },
        })
      : null;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    if (!this.client) {
      return this.stubComplete(opts);
    }

    const budgetKey = this.budgetKey(opts.userId);
    const used = parseInt((await this.redis.get(budgetKey)) ?? '0', 10);
    if (used >= this.tokenCap) {
      throw new TokenBudgetExceededError(opts.userId, used, this.tokenCap);
    }

    const systemText = opts.systemBlocks.map((b) => b.text).join('\n\n');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemText },
      ...opts.messages,
    ];

    const response = await pRetry(
      async () => {
        try {
          return await this.client!.chat.completions.create({
            model: opts.model ?? this.defaultModel,
            max_tokens: opts.maxTokens ?? 4096,
            messages,
          });
        } catch (err) {
          if (err instanceof OpenAI.APIError) {
            if (err.status === 429) throw new AiRateLimitError(err.message);
            if (err.status === 408 || err.status === 504) throw new AiTimeoutError(err.message);
            if (err.status >= 500) throw err;
            throw new AbortError(err.message);
          }
          throw err;
        }
      },
      {
        retries: 2,
        factor: 2,
        minTimeout: 1000,
        onFailedAttempt: (error) => {
          if (error.retriesLeft === 0) return;
        },
      },
    );

    const text = response.choices[0]?.message.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    // OpenRouter passes through Anthropic's cache token fields when using Anthropic models
    const usageExtra = (response.usage ?? {}) as unknown as Record<string, number>;
    const cacheReadTokens = usageExtra['cache_read_input_tokens'] ?? 0;
    const cacheCreationTokens = usageExtra['cache_creation_input_tokens'] ?? 0;

    const totalTokens = inputTokens + outputTokens;
    await this.redis
      .pipeline()
      .incrby(budgetKey, totalTokens)
      .expire(budgetKey, 35 * 24 * 60 * 60)
      .exec();

    return { text, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
  }

  private stubComplete(opts: CompleteOptions): CompleteResult {
    const lastUserMsg = [...opts.messages].reverse().find((m) => m.role === 'user');
    const preview = lastUserMsg?.content.slice(0, 80) ?? 'content';
    const text = `[STUB] Generated content for: ${preview}\n\nThis is placeholder content returned by the stub adapter. Set OPENROUTER_API_KEY to enable real generation.`;
    return { text, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  }

  private budgetKey(userId: string) {
    const now = new Date();
    return `tok:${userId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
