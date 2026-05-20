import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/jobs/trend-harvesting/sources/google-trends', () => ({
  GoogleTrendsClient: vi.fn().mockImplementation(() => ({
    fetchTrends: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../src/jobs/trend-harvesting/sources/x', () => ({
  XTrendsClient: vi.fn().mockImplementation(() => ({
    fetchTrends: vi.fn().mockResolvedValue([
      { topic_name: 'AI Agents', topic_slug: 'ai-agents', raw_data: { tweet_volume: 50000 } },
      { topic_name: 'Open Source LLMs', topic_slug: 'open-source-llms', raw_data: { tweet_volume: 30000 } },
    ]),
  })),
}));

import { processTrendHarvesting } from '../../src/jobs/trend-harvesting/index';
import { publishToUser } from '../../src/lib/ws-publish';
import { GoogleTrendsClient } from '../../src/jobs/trend-harvesting/sources/google-trends';

const mockPublish = vi.mocked(publishToUser);

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
    insert: function () {
      const self = this;
      return {
        values: (_v: any) => {
          const p = Promise.resolve(self._queue.shift() ?? []);
          return {
            returning: (_fields?: any) => p,
            then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p),
          };
        },
      };
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

function makeDeps() {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const aiClient = {} as any;
  const queues = { 'idea-generation': { add: vi.fn().mockResolvedValue({ id: 'ig-1' }) } } as any;
  const env = {
    X_API_BEARER_TOKEN: 'xbt-test',
    NEWSAPI_KEY: '',
    REDDIT_CLIENT_ID: '',
    REDDIT_CLIENT_SECRET: '',
    YOUTUBE_API_KEY: '',
    GOOGLE_TRENDS_ENABLED: '',
  };
  return { db: makeDb(), redis, aiClient, queues, logger: logger as any, env };
}

const basePayload = {
  job_type: 'trend_harvesting' as const,
  user_id: 'u1',
  trend_run_id: 'run-1',
  domain_profile: { primary_domain: 'technology', sub_domains: [], region: 'IN-MH' },
};

beforeEach(() => {
  mockPublish.mockClear();
  vi.mocked(GoogleTrendsClient).mockClear();
});

afterEach(() => { vi.clearAllMocks(); });

describe('processTrendHarvesting — happy path', () => {
  it('fetches google trends, inserts trend rows, marks run completed, chains idea-generation', async () => {
    vi.mocked(GoogleTrendsClient).mockImplementationOnce(() => ({
      fetchTrends: vi.fn().mockResolvedValue([
        { topic_name: 'AI Agents', topic_slug: 'ai-agents', raw_data: { traffic: 50000 } },
        { topic_name: 'Open Source LLMs', topic_slug: 'open-source-llms', raw_data: { traffic: 30000 } },
      ]),
    }) as any);

    const deps = makeDeps();
    deps.db._queue = [
      [],              // update trendRun to 'running'
      [{ id: 't1' }], // insert trend 1 returning
      [{ id: 't2' }], // insert trend 2 returning
      [],              // update trendRun to 'completed'
    ];

    await processTrendHarvesting(basePayload, deps);

    const instance = vi.mocked(GoogleTrendsClient).mock.results[0]!.value as any;
    expect(instance.fetchTrends).toHaveBeenCalledWith('technology', 'IN-MH', [], undefined);

    expect(deps.queues['idea-generation'].add).toHaveBeenCalledWith(
      'idea_generation',
      expect.objectContaining({
        job_type: 'idea_generation',
        trend_run_id: 'run-1',
        trend_ids: ['t1', 't2'],
      }),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_completed' }),
    );
  });
});

describe('processTrendHarvesting — source fetch failure', () => {
  it('logs warn for failed source but still completes run and chains idea-generation', async () => {
    vi.mocked(GoogleTrendsClient).mockImplementationOnce(() => ({
      fetchTrends: vi.fn().mockRejectedValue(new Error('Google Trends 429')),
    }) as any);

    const deps = makeDeps();
    deps.db._queue = [
      [],  // update to 'running'
      [],  // update to 'completed' (no trends inserted)
    ];

    await processTrendHarvesting(basePayload, deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ trendRunId: 'run-1' }),
      expect.any(String),
    );
    expect(deps.queues['idea-generation'].add).toHaveBeenCalledWith(
      'idea_generation',
      expect.objectContaining({ trend_ids: [] }),
    );
  });
});

describe('processTrendHarvesting — trend_cap', () => {
  it('respects trend_cap in payload — inserts only N trends and chains with N ids', async () => {
    vi.mocked(GoogleTrendsClient).mockImplementationOnce(() => ({
      fetchTrends: vi.fn().mockResolvedValue([
        { topic_name: 'T1', topic_slug: 't1', raw_data: {} },
        { topic_name: 'T2', topic_slug: 't2', raw_data: {} },
        { topic_name: 'T3', topic_slug: 't3', raw_data: {} },
      ]),
    }) as any);

    const deps = makeDeps();
    deps.db._queue = [
      [],              // update to 'running'
      [{ id: 'x1' }], // insert trend 1 returning
      [],              // update to 'completed'
    ];

    await processTrendHarvesting({ ...basePayload, trend_cap: 1 }, deps);

    expect(deps.queues['idea-generation'].add).toHaveBeenCalledWith(
      'idea_generation',
      expect.objectContaining({ trend_ids: ['x1'] }),
    );
  });
});

describe('processTrendHarvesting — empty results from source', () => {
  it('completes run with zero inserted trends when source returns empty array', async () => {
    vi.mocked(GoogleTrendsClient).mockImplementationOnce(() => ({
      fetchTrends: vi.fn().mockResolvedValue([]),
    }) as any);

    const deps = makeDeps();
    deps.db._queue = [
      [],  // update to 'running'
      [],  // update to 'completed'
    ];

    await processTrendHarvesting(basePayload, deps);

    expect(deps.queues['idea-generation'].add).toHaveBeenCalledWith(
      'idea_generation',
      expect.objectContaining({ trend_ids: [] }),
    );
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });
});
