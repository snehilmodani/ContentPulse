import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packageRoutes } from '../src/routes/packages';
import {
  MockDb, buildApp, makeToken,
  mockContentPackage, mockIdea, mockTrend, mockBrief, mockDraft, mockVisual,
} from './helpers';

describe('GET /content-packages', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns list with hook_line from joined ideas table', async () => {
    db.enqueue([{
      id: mockContentPackage.id,
      status: mockContentPackage.status,
      createdAt: mockContentPackage.createdAt,
      updatedAt: mockContentPackage.updatedAt,
      hookLine: mockIdea.hookLine,
    }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(mockContentPackage.id);
    expect(body.data[0].hook_line).toBe(mockIdea.hookLine);
  });

  it('returns hook_line: null when no idea is joined', async () => {
    db.enqueue([{
      id: mockContentPackage.id,
      status: mockContentPackage.status,
      createdAt: mockContentPackage.createdAt,
      updatedAt: mockContentPackage.updatedAt,
      hookLine: null,
    }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].hook_line).toBeNull();
  });
});

describe('GET /content-packages/:packageId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns package with draft_count and visual_count', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([{ draftCount: 3 }]);
    db.enqueue([{ visualCount: 2 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/content-packages/${mockContentPackage.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockContentPackage.id);
    expect(body.draft_count).toBe(3);
    expect(body.visual_count).toBe(2);
  });

  it('returns 404 when package not found or belongs to another user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages/ghost',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /content-packages/:packageId/brief', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns full brief shape', async () => {
    db.enqueue([{ id: mockContentPackage.id }]);
    db.enqueue([mockBrief]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/content-packages/${mockContentPackage.id}/brief`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockBrief.id);
    expect(body.topic_summary).toBe(mockBrief.topicSummary);
    expect(body.key_facts).toHaveLength(1);
  });

  it('returns 404 when package not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages/ghost/brief',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when no brief exists for the package', async () => {
    db.enqueue([{ id: mockContentPackage.id }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/content-packages/${mockContentPackage.id}/brief`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /content-packages/:packageId/drafts', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns list of drafts with all serialised fields', async () => {
    db.enqueue([{ id: mockContentPackage.id }]);
    db.enqueue([mockDraft]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/content-packages/${mockContentPackage.id}/drafts`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: mockDraft.id,
      format: mockDraft.format,
      status: mockDraft.status,
      version: mockDraft.version,
    });
  });

  it('returns 404 when package not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages/ghost/drafts',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /content-packages/:packageId/visuals', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns list of visuals with all serialised fields', async () => {
    db.enqueue([{ id: mockContentPackage.id }]);
    db.enqueue([mockVisual]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/content-packages/${mockContentPackage.id}/visuals`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: mockVisual.id,
      visual_type: mockVisual.visualType,
      status: mockVisual.status,
      cdn_url: mockVisual.cdnUrl,
    });
  });

  it('returns 404 when package not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/content-packages/ghost/visuals',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /content-packages/:packageId/research', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let queues: Awaited<ReturnType<typeof buildApp>>['queues'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app, queues } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('deletes existing brief, resets package status, enqueues research-brief job, responds 202', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([mockIdea]);
    db.enqueue([mockTrend]);
    db.enqueue([]);   // delete brief
    db.enqueue([]);   // update package status
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/content-packages/${mockContentPackage.id}/research`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.package_id).toBe(mockContentPackage.id);
    expect(body.status).toBe('pending');
    expect(body.job_id).toBeTruthy();
    expect(queues['research-brief'].add).toHaveBeenCalledWith(
      'research_brief',
      expect.objectContaining({
        job_type: 'research_brief',
        content_package_id: mockContentPackage.id,
        idea: expect.objectContaining({ hook_line: mockIdea.hookLine }),
        domain_profile: expect.objectContaining({ primary_domain: mockTrend.topicSlug }),
      }),
    );
  });

  it('falls back to idea.hookLine in domain_profile when trend is missing', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([mockIdea]);
    db.enqueue([]);   // no trend
    db.enqueue([]);   // delete
    db.enqueue([]);   // update
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/content-packages/${mockContentPackage.id}/research`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(202);
    expect(queues['research-brief'].add).toHaveBeenCalledWith(
      'research_brief',
      expect.objectContaining({
        domain_profile: expect.objectContaining({ primary_domain: mockIdea.hookLine }),
      }),
    );
  });

  it('returns 404 when package not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/content-packages/ghost/research',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when idea not found', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([]);   // idea missing
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/content-packages/${mockContentPackage.id}/research`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /content-packages/:packageId/export', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let queues: Awaited<ReturnType<typeof buildApp>>['queues'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app, queues } = await buildApp(db));
    await packageRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('enqueues export-package job with approved draft/visual IDs, responds 202', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([{ id: 'd1' }, { id: 'd2' }]);   // approved drafts
    db.enqueue([{ id: 'v1' }]);                  // approved visuals
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/content-packages/${mockContentPackage.id}/export`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.package_id).toBe(mockContentPackage.id);
    expect(body.status).toBe('exporting');
    expect(queues['export-package'].add).toHaveBeenCalledWith(
      'export_package',
      expect.objectContaining({
        job_type: 'export_package',
        content_package_id: mockContentPackage.id,
        approved_draft_ids: ['d1', 'd2'],
        approved_visual_ids: ['v1'],
      }),
    );
  });

  it('approved arrays are empty when nothing is approved', async () => {
    db.enqueue([mockContentPackage]);
    db.enqueue([]);   // no approved drafts
    db.enqueue([]);   // no approved visuals
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/content-packages/${mockContentPackage.id}/export`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(202);
    expect(queues['export-package'].add).toHaveBeenCalledWith(
      'export_package',
      expect.objectContaining({
        approved_draft_ids: [],
        approved_visual_ids: [],
      }),
    );
  });

  it('returns 404 when package not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/content-packages/ghost/export',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
