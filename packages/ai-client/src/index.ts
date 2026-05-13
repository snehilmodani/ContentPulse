import Anthropic from '@anthropic-ai/sdk';
import type { Redis } from 'ioredis';
import pRetry, { AbortError } from 'p-retry';
import { AiRateLimitError, AiTimeoutError, TokenBudgetExceededError } from './errors';

export { AiRateLimitError, AiTimeoutError, TokenBudgetExceededError };

const DEFAULT_MODEL = 'claude-sonnet-4-6';
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
  private readonly client: Anthropic | null;
  private readonly redis: Redis;
  private readonly tokenCap: number;

  constructor(apiKey: string, redis: Redis, tokenCap = DEFAULT_TOKEN_CAP) {
    this.redis = redis;
    this.tokenCap = tokenCap;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
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

    const system: Anthropic.Messages.TextBlockParam[] = opts.systemBlocks.map((b) => {
      const block: Anthropic.Messages.TextBlockParam = { type: 'text', text: b.text };
      if (b.cacheable) {
        (block as Anthropic.Messages.TextBlockParam & {
          cache_control?: { type: 'ephemeral' };
        }).cache_control = { type: 'ephemeral' };
      }
      return block;
    });

    const response = await pRetry(
      async () => {
        try {
          return await this.client!.messages.create({
            model: opts.model ?? DEFAULT_MODEL,
            max_tokens: opts.maxTokens ?? 4096,
            system,
            messages: opts.messages,
          });
        } catch (err) {
          if (err instanceof Anthropic.APIError) {
            if (err.status === 429) {
              throw new AiRateLimitError(err.message);
            }
            if (err.status === 408 || err.status === 504) {
              throw new AiTimeoutError(err.message);
            }
            if (err.status >= 500) {
              throw err;
            }
            // 4xx errors other than 429 are not retryable
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

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheReadTokens =
      (response.usage as Record<string, number>)['cache_read_input_tokens'] ?? 0;
    const cacheCreationTokens =
      (response.usage as Record<string, number>)['cache_creation_input_tokens'] ?? 0;

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
    const text = `[STUB] Generated content for: ${preview}\n\nThis is placeholder content returned by the stub adapter. Set ANTHROPIC_API_KEY to enable real generation.`;
    return { text, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  }

  private budgetKey(userId: string) {
    const now = new Date();
    return `tok:${userId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
