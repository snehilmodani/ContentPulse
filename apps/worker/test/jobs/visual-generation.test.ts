import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/redis-coord', () => ({
  incrStagesDone: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../src/adapters/dalle', () => ({
  DalleClient: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({ url: 'https://dalle.example.com/img.png', revisedPrompt: 'revised' }),
  })),
  getDimensions: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
}));
vi.mock('../../src/adapters/unsplash', () => ({
  UnsplashClient: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ url: 'https://unsplash.example.com/img.jpg' }),
  })),
}));

import { processVisualGeneration } from '../../src/jobs/visual-generation/index';
import { publishToUser } from '../../src/lib/ws-publish';
import { incrStagesDone } from '../../src/lib/redis-coord';
import { DalleClient } from '../../src/adapters/dalle';
import { UnsplashClient } from '../../src/adapters/unsplash';

const mockPublish = vi.mocked(publishToUser);
const mockIncrStagesDone = vi.mocked(incrStagesDone);

function makeDb(queue: any[] = []) {
  const db = {
    _queue: queue,
    select: function () {
      const p = Promise.resolve(this._queue.shift() ?? []);
      const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
      const noop = () => chain;
      for (const m of ['from', 'where', 'orderBy', 'limit']) chain[m] = noop;
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
            return { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
          },
        }),
      };
    },
  };
  return db as any;
}

function makeDeps(envOverrides: Record<string, string> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const queues = { 'notification-send': { add: vi.fn().mockResolvedValue({ id: 'nj1' }) } } as any;
  const uploadToR2 = vi.fn().mockResolvedValue('https://r2.example.com/visual.jpg');
  const env = {
    OPENAI_API_KEY: 'sk-test',
    UNSPLASH_ACCESS_KEY: 'unsplash-test',
    AI_MODEL_VISUAL: 'dall-e-3',
    BYPASS_VISUAL_GENERATION: 'false',
    ...envOverrides,
  };

  return { db: makeDb(), redis, queues, logger: logger as any, uploadToR2, env };
}

const basePayload = {
  job_type: 'visual_generation' as const,
  user_id: 'u1',
  content_package_id: 'pkg-1',
  trend_category: 'technology',
  visual_types: ['thumbnail' as const],
};

beforeEach(() => {
  mockPublish.mockClear();
  mockIncrStagesDone.mockClear();
  vi.mocked(DalleClient).mockClear();
  vi.mocked(UnsplashClient).mockClear();
});

describe('processVisualGeneration — bypass mode', () => {
  it('inserts picsum placeholder visuals without calling DALL-E or Unsplash', async () => {
    const deps = makeDeps({ BYPASS_VISUAL_GENERATION: 'true' });
    deps.db._queue = [[], []]; // insert visual (no returning needed)

    await processVisualGeneration(basePayload, deps);

    expect(vi.mocked(DalleClient)).not.toHaveBeenCalled();
    expect(vi.mocked(UnsplashClient)).not.toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ event: 'pipeline_stage_started' }));
  });
});

describe('processVisualGeneration — AI path (thumbnail)', () => {
  it('calls DalleClient.generate, uploads to R2, inserts visual row', async () => {
    const deps = makeDeps();
    // mock fetch for fetchImageBuffer inside the job
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
    deps.db._queue = [[]]; // insert visual

    await processVisualGeneration(basePayload, deps);

    const DalleMock = vi.mocked(DalleClient);
    const instance = DalleMock.mock.results[0]!.value as any;
    expect(instance.generate).toHaveBeenCalled();
    expect(deps.uploadToR2).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('processVisualGeneration — Unsplash path (non-AI type)', () => {
  it('calls UnsplashClient.search, uploads to R2, inserts visual row', async () => {
    const payload = { ...basePayload, visual_types: ['square_post' as const] };
    const deps = makeDeps();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
    deps.db._queue = [[]];

    await processVisualGeneration(payload, deps);

    const UnsplashMock = vi.mocked(UnsplashClient);
    const instance = UnsplashMock.mock.results[0]!.value as any;
    expect(instance.search).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('processVisualGeneration — publishes WS events', () => {
  it('calls incrStagesDone and publishes pipeline_stage_completed', async () => {
    const deps = makeDeps({ BYPASS_VISUAL_GENERATION: 'true' });
    deps.db._queue = [[]];

    await processVisualGeneration(basePayload, deps);

    expect(mockIncrStagesDone).toHaveBeenCalledWith(expect.anything(), 'pkg-1');
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_completed' }),
    );
  });
});

describe('processVisualGeneration — stagesDone >= 2 triggers package_ready', () => {
  it('publishes package_ready and enqueues notification when stagesDone reaches 2', async () => {
    mockIncrStagesDone.mockResolvedValueOnce(2);

    const deps = makeDeps({ BYPASS_VISUAL_GENERATION: 'true' });
    const mockVisualRow = { id: 'visual-1', visualType: 'thumbnail', cdnUrl: 'https://cdn.example.com/img.jpg' };
    deps.db._queue = [
      [],                       // bypass insert visual
      [mockVisualRow],          // select visuals for package_ready
      [],                       // update contentPackages
      [{ id: 'notif-vg-1' }],  // notification insert returning
    ];

    await processVisualGeneration(basePayload, deps);

    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'package_ready', data: expect.objectContaining({ content_package_id: 'pkg-1' }) }),
    );
    expect(deps.queues['notification-send'].add).toHaveBeenCalledWith(
      'notification_send',
      expect.objectContaining({ event: 'package_ready', notification_id: 'notif-vg-1' }),
    );
  });
});

describe('processVisualGeneration — error path inserts placeholder', () => {
  it('inserts placeholder with generating status when DALL-E throws', async () => {
    vi.mocked(DalleClient).mockImplementationOnce(() => ({
      generate: vi.fn().mockRejectedValue(new Error('DALL-E 500')),
    }) as any);

    const deps = makeDeps();
    vi.stubGlobal('fetch', vi.fn());
    deps.db._queue = [[]]; // placeholder insert

    await processVisualGeneration(basePayload, deps);

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', visualType: 'thumbnail' }),
      expect.any(String),
    );

    vi.unstubAllGlobals();
  });
});
