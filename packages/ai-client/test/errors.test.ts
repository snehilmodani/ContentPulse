import { describe, expect, it } from 'vitest';
import { AiRateLimitError, AiTimeoutError, TokenBudgetExceededError } from '../src/errors';

describe('AiTimeoutError', () => {
  it('has correct name and default message', () => {
    const err = new AiTimeoutError();
    expect(err.name).toBe('AiTimeoutError');
    expect(err.message).toBe('AI request timed out');
    expect(err instanceof Error).toBe(true);
  });

  it('accepts a custom message', () => {
    const err = new AiTimeoutError('took too long');
    expect(err.message).toBe('took too long');
  });
});

describe('AiRateLimitError', () => {
  it('has correct name and default message', () => {
    const err = new AiRateLimitError();
    expect(err.name).toBe('AiRateLimitError');
    expect(err.message).toBe('AI rate limit exceeded');
    expect(err instanceof Error).toBe(true);
  });

  it('stores retryAfterMs when provided', () => {
    const err = new AiRateLimitError('rate limited', 5000);
    expect(err.retryAfterMs).toBe(5000);
  });

  it('retryAfterMs is undefined when not provided', () => {
    const err = new AiRateLimitError();
    expect(err.retryAfterMs).toBeUndefined();
  });

  it('accepts custom message with retryAfterMs', () => {
    const err = new AiRateLimitError('quota hit', 30_000);
    expect(err.message).toBe('quota hit');
    expect(err.retryAfterMs).toBe(30_000);
  });
});

describe('TokenBudgetExceededError', () => {
  it('has correct name', () => {
    const err = new TokenBudgetExceededError('user-1', 900_000, 1_000_000);
    expect(err.name).toBe('TokenBudgetExceededError');
    expect(err instanceof Error).toBe(true);
  });

  it('stores userId, used, and cap', () => {
    const err = new TokenBudgetExceededError('user-abc', 750_000, 1_000_000);
    expect(err.userId).toBe('user-abc');
    expect(err.used).toBe(750_000);
    expect(err.cap).toBe(1_000_000);
  });

  it('message includes userId and token counts', () => {
    const err = new TokenBudgetExceededError('user-abc', 999_999, 1_000_000);
    expect(err.message).toContain('user-abc');
    expect(err.message).toContain('999999');
    expect(err.message).toContain('1000000');
  });

  it('handles zero usage', () => {
    const err = new TokenBudgetExceededError('user-x', 0, 100);
    expect(err.message).toContain('0');
  });
});
