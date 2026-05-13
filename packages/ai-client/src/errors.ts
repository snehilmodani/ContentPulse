export class AiTimeoutError extends Error {
  constructor(message = 'AI request timed out') {
    super(message);
    this.name = 'AiTimeoutError';
  }
}

export class AiRateLimitError extends Error {
  constructor(
    message = 'AI rate limit exceeded',
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiRateLimitError';
  }
}

export class TokenBudgetExceededError extends Error {
  constructor(
    public readonly userId: string,
    public readonly used: number,
    public readonly cap: number,
  ) {
    super(`Token budget exceeded for user ${userId}: ${used}/${cap}`);
    this.name = 'TokenBudgetExceededError';
  }
}
