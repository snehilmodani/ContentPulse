import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/adapters/dalle', () => ({
  DalleClient: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({ url: 'https://dalle.example.com/new.png', revisedPrompt: 'new prompt' }),
  })),
  getDimensions: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
}));
vi.mock('../../src/adapters/unsplash', () => ({
  UnsplashClient: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ url: 'https://unsplash.example.com/new.jpg' }),
  })),
}));

import { processVisualRegeneration } from '../../src/jobs/visual-regeneration/index';
import { publishToUser } from '../../src/lib/ws-publish';
import { DalleClient } from '../../src/adapters/dalle';
import { UnsplashClient } from '../../src/adapters/unsplash';

const mockPublish = vi.mocked(publishToUser);

const mockVisual = {
  id: 'visual-1',
  contentPackageId: 'pkg-1',
  userId: 'u1',
  visualType: 'thumbnail',
  widthPx: 1280,
  heightPx: 720,
  generationMethod: 'ai_dalle',
  status: 'ready',
  r2Key: 'visuals/u1/pkg-1/thumbnail-1.jpg',
  cdnUrl: 'https://cdn.example.com/old.jpg',
  promptUsed: 'old prompt',
  version: 1,
};

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

function makeDeps() {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const uploadToR2 = vi.fn().mockResolvedValue('https://r2.example.com/new.jpg');
  const env = { OPENAI_API_KEY: 'sk-test', UNSPLASH_ACCESS_KEY: 'u-test', AI_MODEL_VISUAL: 'dall-e-3' };

  return { db: makeDb(), redis, logger: logger as any, uploadToR2, env };
}

const basePayload = {
  job_type: 'visual_regeneration' as const,
  user_id: 'u1',
  visual_id: 'visual-1',
  content_package_id: 'pkg-1',
};

beforeEach(() => {
  mockPublish.mockClear();
  vi.mocked(DalleClient).mockClear();
  vi.mocked(UnsplashClient).mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('processVisualRegeneration — DALL-E path', () => {
  it('fetches visual, regenerates via DALL-E, increments version, publishes visual_regenerated', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockVisual],  // visual lookup
      [],            // update visual
    ];

    await processVisualRegeneration(basePayload, deps);

    const instance = vi.mocked(DalleClient).mock.results[0]!.value as any;
    expect(instance.generate).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({
        event: 'visual_regenerated',
        data: expect.objectContaining({ visual_id: 'visual-1', version: 2 }),
      }),
    );
  });
});

describe('processVisualRegeneration — Unsplash path via override_method', () => {
  it('uses UnsplashClient when override_method is web_unsplash', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockVisual],
      [],
    ];

    await processVisualRegeneration({ ...basePayload, override_method: 'web_unsplash' }, deps);

    const instance = vi.mocked(UnsplashClient).mock.results[0]!.value as any;
    expect(instance.search).toHaveBeenCalled();
  });
});

describe('processVisualRegeneration — visual not found', () => {
  it('throws with the visual ID', async () => {
    const deps = makeDeps();
    deps.db._queue = [[]];

    await expect(processVisualRegeneration(basePayload, deps)).rejects.toThrow('visual-1');
  });
});
