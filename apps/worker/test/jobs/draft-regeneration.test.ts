import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { safeParse, processDraftRegeneration } from '../../src/jobs/draft-regeneration/index';
import { publishToUser } from '../../src/lib/ws-publish';

const mockPublish = vi.mocked(publishToUser);

// ── safeParse unit tests ───────────────────────────────────────────────────

describe('safeParse — valid JSON', () => {
  it('returns parsed object', () => {
    const result = safeParse('{"hook_tweet":"Hello"}');
    expect(result).toEqual({ hook_tweet: 'Hello' });
  });
});

describe('safeParse — invalid JSON', () => {
  it('returns { raw_text }', () => {
    const result = safeParse('not json');
    expect(result).toEqual({ raw_text: 'not json' });
  });
});

// ── processDraftRegeneration integration tests ─────────────────────────────

function makeDb(queue: any[] = []) {
  const db = {
    _queue: queue,
    select: function () {
      const p = Promise.resolve(this._queue.shift() ?? []);
      const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
      const noop = () => chain;
      for (const m of ['from', 'where', 'limit']) chain[m] = noop;
      return chain;
    },
    update: function () {
      const self = this;
      return {
        set: () => ({
          where: () => {
            const p = Promise.resolve(self._queue.shift() ?? []);
            return { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
          },
        }),
      };
    },
  };
  return db as any;
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const aiClient = {
    complete: vi.fn().mockResolvedValue({ text: '{"hook_tweet":"Regenerated"}', inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 }),
    defaultModel: 'test-model',
  } as any;

  return { db: makeDb(), redis, aiClient, logger: logger as any, ...overrides };
}

const mockDraft = {
  id: 'draft-1',
  contentPackageId: 'pkg-1',
  userId: 'u1',
  format: 'x_thread',
  status: 'regenerating',
  contentBody: { hook_tweet: 'Old content' },
  version: 1,
  previousVersions: [],
};

const basePayload = {
  job_type: 'draft_regeneration' as const,
  user_id: 'u1',
  draft_id: 'draft-1',
  content_package_id: 'pkg-1',
  format: 'x_thread' as const,
  instruction: 'Make it shorter',
  topic_brief_id: 'brief-1',
};

beforeEach(() => { mockPublish.mockClear(); });

describe('processDraftRegeneration — draft not found', () => {
  it('throws Error with draft ID', async () => {
    const deps = makeDeps();
    deps.db._queue = [[], []]; // draft not found, brief

    await expect(processDraftRegeneration(basePayload, deps)).rejects.toThrow('draft-1');
  });
});

describe('processDraftRegeneration — full flow', () => {
  it('calls aiClient.complete, updates draft content and version, publishes draft_regenerated', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockDraft],  // draft
      [],           // brief
      [],           // update draft
    ];

    await processDraftRegeneration(basePayload, deps);

    expect(deps.aiClient.complete).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'draft_regenerated', data: expect.objectContaining({ draft_id: 'draft-1', version: 2 }) }),
    );
  });
});

describe('processDraftRegeneration — AI error', () => {
  it('updates draft status back to draft and re-throws', async () => {
    const aiError = new Error('OpenRouter 503');
    const deps = makeDeps();
    deps.aiClient.complete = vi.fn().mockRejectedValue(aiError);
    deps.db._queue = [
      [mockDraft],  // draft
      [],           // brief
      [],           // update on error path
    ];

    await expect(processDraftRegeneration(basePayload, deps)).rejects.toThrow('OpenRouter 503');
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft-1' }),
      expect.any(String),
    );
  });
});
