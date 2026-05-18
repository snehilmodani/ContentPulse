import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { processExportPackage } from '../../src/jobs/export-package/index';
import { publishToUser } from '../../src/lib/ws-publish';

const mockPublish = vi.mocked(publishToUser);

const mockDraftRow = {
  id: 'draft-1',
  format: 'x_thread',
  contentBody: { hook_tweet: 'AI is great', tweets: [], cta_tweet: 'Follow', hashtags: [] },
  contentPackageId: 'pkg-1',
  userId: 'u1',
  status: 'approved',
};

const mockVisualRow = {
  id: 'visual-1',
  visualType: 'thumbnail',
  cdnUrl: 'https://cdn.example.com/thumb.jpg',
  contentPackageId: 'pkg-1',
  userId: 'u1',
  status: 'approved',
};

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

function makeDeps() {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const queues = { 'notification-send': { add: vi.fn().mockResolvedValue({ id: 'nj-1' }) } } as any;
  const uploadZipToR2 = vi.fn().mockResolvedValue('https://r2.example.com/export.zip');
  const getSignedUrl = vi.fn().mockResolvedValue('https://signed.example.com/export.zip?sig=abc');

  return { db: makeDb(), redis, queues, logger: logger as any, uploadZipToR2, getSignedUrl };
}

const basePayload = {
  job_type: 'export_package' as const,
  user_id: 'u1',
  content_package_id: 'pkg-1',
  approved_draft_ids: ['draft-1'],
  approved_visual_ids: ['visual-1'],
};

beforeEach(() => { mockPublish.mockClear(); });
afterEach(() => { vi.clearAllMocks(); });

describe('processExportPackage — explicit IDs path', () => {
  it('builds ZIP, uploads to R2, publishes export_ready, enqueues notification', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockDraftRow],
      [mockVisualRow],
      [],
      [{ id: 'notif-x' }],
    ];

    await processExportPackage(basePayload, deps);

    expect(deps.uploadZipToR2).toHaveBeenCalledOnce();
    expect(deps.getSignedUrl).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'export_ready' }),
    );
    expect(deps.queues['notification-send'].add).toHaveBeenCalledWith(
      'notification_send',
      expect.objectContaining({ event: 'export_ready', notification_id: 'notif-x' }),
    );
  });
});

describe('processExportPackage — all-approved path (empty explicit ID arrays)', () => {
  it('selects all approved drafts and visuals when id arrays are empty', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockDraftRow],
      [mockVisualRow],
      [],
      [{ id: 'notif-y' }],
    ];

    await processExportPackage({ ...basePayload, approved_draft_ids: [], approved_visual_ids: [] }, deps);

    expect(deps.uploadZipToR2).toHaveBeenCalledOnce();
  });
});

describe('processExportPackage — no approved drafts', () => {
  it('logs warn when no drafts found but still completes and uploads ZIP', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [],              // empty draftList
      [mockVisualRow],
      [],
      [{ id: 'notif-z' }],
    ];

    await processExportPackage({ ...basePayload, approved_draft_ids: [] }, deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contentPackageId: 'pkg-1' }),
      expect.stringContaining('No approved drafts'),
    );
    expect(deps.uploadZipToR2).toHaveBeenCalledOnce();
  });
});

describe('processExportPackage — notification insert returns nothing', () => {
  it('logs warn and skips queue enqueue when notification insert returns no row', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [mockDraftRow],
      [mockVisualRow],
      [],
      [],  // empty returning → notif is undefined
    ];

    await processExportPackage(basePayload, deps);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contentPackageId: 'pkg-1' }),
      expect.stringContaining('export_ready notification insert returned no row'),
    );
    expect(deps.queues['notification-send'].add).not.toHaveBeenCalled();
  });
});
