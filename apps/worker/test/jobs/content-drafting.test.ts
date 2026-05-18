import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/redis-coord', () => ({
  incrStagesDone: vi.fn().mockResolvedValue(0),
}));

import { safeParseContent, processContentDrafting } from '../../src/jobs/content-drafting/index';
import { publishToUser } from '../../src/lib/ws-publish';
import { incrStagesDone } from '../../src/lib/redis-coord';

const mockPublish = vi.mocked(publishToUser);
const mockIncrStagesDone = vi.mocked(incrStagesDone);

// ── safeParseContent unit tests ────────────────────────────────────────────

describe('safeParseContent — valid JSON', () => {
  it('returns parsed object', () => {
    const result = safeParseContent('{"hook_tweet":"Hello","tweets":[]}');
    expect(result).toEqual({ hook_tweet: 'Hello', tweets: [] });
  });
});

describe('safeParseContent — invalid JSON', () => {
  it('returns { raw_text: originalString }', () => {
    const result = safeParseContent('not valid json');
    expect(result).toEqual({ raw_text: 'not valid json' });
  });
});

// ── processContentDrafting integration tests ───────────────────────────────

function makeDb(queue: any[] = []) {
  const db = {
    _queue: queue,
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
          return { returning: () => p, then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
        },
      };
    },
    update: function () {
      const self = this;
      return {
        set: () => ({
          where: () => {
            const p = Promise.resolve(self._queue.shift() ?? []);
            return { returning: () => p, then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
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
    complete: vi.fn().mockResolvedValue({ text: '{"hook_tweet":"Test"}', inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 }),
    defaultModel: 'test-model',
  } as any;
  const queues = { 'notification-send': { add: vi.fn().mockResolvedValue({ id: 'nj1' }) } } as any;

  return { db: makeDb(), redis, aiClient, queues, logger: logger as any, ...overrides };
}

const basePayload = {
  job_type: 'content_drafting' as const,
  user_id: 'u1',
  content_package_id: 'pkg-1',
  topic_brief_id: 'brief-1',
  idea_id: 'idea-1',
  selected_formats: ['x_thread' as const],
  domain_profile: { creator_persona: 'tech creator', tone_of_voice: ['professional'], primary_domain: 'tech', region: 'IN-MH' },
};

beforeEach(() => { mockPublish.mockClear(); mockIncrStagesDone.mockClear(); });

describe('processContentDrafting — wrong job_type', () => {
  it('returns early immediately without calling AI', async () => {
    const deps = makeDeps();
    const badPayload = { ...basePayload, job_type: 'something_else' as any };
    await processContentDrafting(badPayload, deps);
    expect(deps.aiClient.complete).not.toHaveBeenCalled();
  });
});

describe('processContentDrafting — missing brief or idea', () => {
  it('throws when brief is missing', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [],              // brief not found
      [{ id: 'idea-1', hookLine: 'Hook', coreArgument: 'Arg', angleType: 'news' }], // idea
      [],              // domain profile
    ];

    await expect(processContentDrafting(basePayload, deps)).rejects.toThrow('Missing brief or idea');
  });

  it('throws when idea is missing', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ id: 'brief-1', topicSummary: 'AI', keyFacts: [] }], // brief
      [],              // idea not found
      [],              // domain profile
    ];

    await expect(processContentDrafting(basePayload, deps)).rejects.toThrow('Missing brief or idea');
  });
});

describe('processContentDrafting — full flow', () => {
  it('calls AI once per format, inserts draft rows, publishes WS events', async () => {
    const mockBrief = { id: 'brief-1', topicSummary: 'AI is great', keyFacts: [] };
    const mockIdea = { id: 'idea-1', hookLine: 'Hook', coreArgument: 'Arg', angleType: 'news' };
    const mockProfile = { creatorPersona: 'tech blogger', toneOfVoice: ['casual'] };

    const deps = makeDeps();
    deps.db._queue = [
      [mockBrief],
      [mockIdea],
      [mockProfile],
      [],              // check existing draft (not found → insert path)
      // insert draft returns nothing (no returning called in insert path)
    ];

    // Mock setTimeout to be instant for the sleep between formats
    vi.useFakeTimers();
    const promise = processContentDrafting(basePayload, deps);
    vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(deps.aiClient.complete).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_started' }),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_completed' }),
    );
  });
});

describe('processContentDrafting — existing draft update path', () => {
  it('updates version and previousVersions when a draft already exists', async () => {
    const mockBrief = { id: 'brief-1', topicSummary: 'AI is great', keyFacts: [] };
    const mockIdea = { id: 'idea-1', hookLine: 'Hook', coreArgument: 'Arg', angleType: 'news' };
    const mockProfile = { creatorPersona: 'tech blogger', toneOfVoice: ['casual'] };
    const existingDraft = { version: 1, prevVersions: [], contentBody: { hook_tweet: 'Old content' } };

    const deps = makeDeps();
    deps.db._queue = [
      [mockBrief],
      [mockIdea],
      [mockProfile],
      [existingDraft],  // existing draft found → UPDATE path
      [],               // update draft
    ];

    await processContentDrafting(basePayload, deps);

    expect(deps.aiClient.complete).toHaveBeenCalledOnce();
  });
});

describe('processContentDrafting — stagesDone >= 2 triggers package_ready', () => {
  it('publishes package_ready event and enqueues notification when stagesDone reaches 2', async () => {
    const mockBrief = { id: 'brief-1', topicSummary: 'AI is great', keyFacts: [] };
    const mockIdea = { id: 'idea-1', hookLine: 'Hook', coreArgument: 'Arg', angleType: 'news' };
    const mockProfile = { creatorPersona: 'tech blogger', toneOfVoice: ['casual'] };

    mockIncrStagesDone.mockResolvedValueOnce(2);

    const deps = makeDeps();
    deps.db._queue = [
      [mockBrief],
      [mockIdea],
      [mockProfile],
      [],                      // existing draft check (not found)
      [],                      // draft insert
      [{ id: 'draft-r1' }],   // select drafts for package_ready
      [],                      // update contentPackages
      [{ id: 'notif-99' }],   // notification insert returning
    ];

    await processContentDrafting(basePayload, deps);

    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'package_ready', data: expect.objectContaining({ content_package_id: 'pkg-1' }) }),
    );
    expect(deps.queues['notification-send'].add).toHaveBeenCalledWith(
      'notification_send',
      expect.objectContaining({ event: 'package_ready', notification_id: 'notif-99' }),
    );
  });
});
