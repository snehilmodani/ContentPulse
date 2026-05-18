import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { parseIdeasFromText, processIdeaGeneration } from '../../src/jobs/idea-generation/index';
import { publishToUser } from '../../src/lib/ws-publish';

const mockPublish = vi.mocked(publishToUser);

// ── parseIdeasFromText unit tests ──────────────────────────────────────────

describe('parseIdeasFromText — valid JSON', () => {
  const json = JSON.stringify([
    { angle_type: 'news', hook_line: 'Hook A', core_argument: 'Arg A', platform_fit: ['x_twitter'] },
    { angle_type: 'innovation', hook_line: 'Hook B', core_argument: 'Arg B', platform_fit: ['linkedin'] },
    { angle_type: 'contrarian', hook_line: 'Hook C', core_argument: 'Arg C', platform_fit: [] },
    { angle_type: 'comedic', hook_line: 'Hook D', core_argument: 'Arg D', platform_fit: [] },
    { angle_type: 'tangential_insight', hook_line: 'Hook E', core_argument: 'Arg E', platform_fit: [] },
    { angle_type: 'extra', hook_line: 'Hook F', core_argument: 'Arg F', platform_fit: [] },
  ]);

  it('parses array and caps at 5 ideas', () => {
    const result = parseIdeasFromText(json, 't1', 'u1', 'r1', 'haiku');
    expect(result).toHaveLength(5);
  });

  it('assigns angle types in rotation', () => {
    const result = parseIdeasFromText(json, 't1', 'u1', 'r1', 'haiku');
    expect(result[0]!.angleType).toBe('news');
    expect(result[1]!.angleType).toBe('innovation');
    expect(result[4]!.angleType).toBe('tangential_insight');
  });

  it('sets generationMeta.stub = false', () => {
    const result = parseIdeasFromText(json, 't1', 'u1', 'r1', 'haiku');
    expect(result[0]!.generationMeta.stub).toBe(false);
  });
});

describe('parseIdeasFromText — invalid / non-JSON text', () => {
  it('falls back to 5 stub ideas', () => {
    const result = parseIdeasFromText('not json at all', 't1', 'u1', 'r1', 'haiku');
    expect(result).toHaveLength(5);
  });

  it('sets generationMeta.stub = true on all fallback ideas', () => {
    const result = parseIdeasFromText('{broken', 't1', 'u1', 'r1', 'haiku');
    expect(result.every((i) => i.generationMeta.stub === true)).toBe(true);
  });
});

describe('parseIdeasFromText — partial JSON (missing hook_line)', () => {
  it('falls back gracefully when hook_line is missing', () => {
    const partial = JSON.stringify([{ angle_type: 'news', core_argument: 'Arg' }]);
    const result = parseIdeasFromText(partial, 't1', 'u1', 'r1', 'haiku');
    expect(result).toHaveLength(1);
    // hook_line defaults to fallback string
    expect(typeof result[0]!.hookLine).toBe('string');
    expect(result[0]!.hookLine.length).toBeGreaterThan(0);
  });
});

// ── processIdeaGeneration integration tests ────────────────────────────────

function makeDeps(overrides: Partial<Parameters<typeof processIdeaGeneration>[1]> = {}) {
  const mockDb = {
    _queue: [] as any[],
    select: function () {
      const p = Promise.resolve(this._queue.shift() ?? []);
      const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
      const noop = () => chain;
      for (const m of ['from', 'where', 'orderBy', 'limit', 'offset']) chain[m] = noop;
      return chain;
    },
    insert: function () {
      const self = this;
      return {
        values: (_v: any) => {
          const p = Promise.resolve(self._queue.shift() ?? []);
          return {
            returning: () => p,
            then: p.then.bind(p),
            catch: p.catch.bind(p),
            finally: p.finally.bind(p),
          };
        },
      };
    },
  };

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const aiClient = {
    complete: vi.fn().mockResolvedValue({ text: '[]', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }),
    defaultModel: 'test-model',
  } as any;
  const queues = { 'notification-send': { add: vi.fn().mockResolvedValue({ id: 'nj1' }) } } as any;

  return { db: mockDb as any, redis, aiClient, queues, logger: logger as any, ...overrides };
}

const basePayload = {
  job_type: 'idea_generation' as const,
  user_id: 'u1',
  trend_run_id: 'r1',
};

beforeEach(() => { mockPublish.mockClear(); });

describe('processIdeaGeneration — no trends', () => {
  it('logs warning, inserts no ideas, still publishes WS events and notification', async () => {
    const deps = makeDeps();
    // top trends query returns empty
    (deps.db as any)._queue = [
      [],                       // topTrends select
      [{ id: 'notif-1' }],      // notification insert returning
    ];

    await processIdeaGeneration(basePayload, deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.stringContaining('No trends'),
    );
    expect(mockPublish).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ event: 'ideas_ready' }));
    expect(deps.queues['notification-send'].add).toHaveBeenCalled();
  });
});

describe('processIdeaGeneration — with trends', () => {
  it('calls aiClient.complete per trend and inserts ideas', async () => {
    const trend = { id: 't1', topicName: 'AI', category: 'tech', compositeScore: '90' };
    const deps = makeDeps();
    (deps.db as any)._queue = [
      [trend],                   // topTrends
      [],                        // insert ideas (no returning needed)
      [{ id: 'notif-1' }],       // notification insert
    ];
    deps.aiClient.complete = vi.fn().mockResolvedValue({
      text: JSON.stringify([{ angle_type: 'news', hook_line: 'Hook', core_argument: 'Arg', platform_fit: ['x_twitter'] }]),
      inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0,
    });

    await processIdeaGeneration(basePayload, deps);

    expect(deps.aiClient.complete).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ event: 'ideas_ready' }));
  });

  it('logs error and continues to next trend when aiClient throws on one trend', async () => {
    const trend1 = { id: 't1', topicName: 'AI', category: 'tech', compositeScore: '90' };
    const trend2 = { id: 't2', topicName: 'Web3', category: 'crypto', compositeScore: '85' };
    const deps = makeDeps();
    (deps.db as any)._queue = [
      [trend1, trend2],
      [],                    // ideas for trend2 (trend1 fails)
      [{ id: 'notif-1' }],
    ];
    deps.aiClient.complete = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({
        text: JSON.stringify([{ angle_type: 'news', hook_line: 'H', core_argument: 'A', platform_fit: [] }]),
        inputTokens: 5, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0,
      });

    await expect(processIdeaGeneration(basePayload, deps)).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ trendId: 't1' }),
      expect.any(String),
    );
  });
});

describe('processIdeaGeneration — notification', () => {
  it('inserts daily_digest_ready notification and enqueues notification-send', async () => {
    const deps = makeDeps();
    (deps.db as any)._queue = [
      [],                       // no trends
      [{ id: 'notif-99' }],     // notification insert
    ];

    await processIdeaGeneration(basePayload, deps);

    expect(deps.queues['notification-send'].add).toHaveBeenCalledWith(
      'notification_send',
      expect.objectContaining({ notification_id: 'notif-99', event: 'daily_digest_ready' }),
    );
  });
});
