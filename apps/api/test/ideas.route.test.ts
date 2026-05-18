import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ideaRoutes } from '../src/routes/ideas';
import {
  MockDb, buildApp, makeToken,
  mockIdea, mockTrend, mockContentPackage,
  USER_ID,
} from './helpers';

describe('GET /ideas/:ideaId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await ideaRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns full idea shape with nested trend', async () => {
    db.enqueue([mockIdea]);
    db.enqueue([mockTrend]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/ideas/${mockIdea.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockIdea.id);
    expect(body.angle_type).toBe(mockIdea.angleType);
    expect(body.hook_line).toBe(mockIdea.hookLine);
    expect(body.trend).toMatchObject({
      id: mockTrend.id,
      topic_name: mockTrend.topicName,
      topic_slug: mockTrend.topicSlug,
      category: mockTrend.category,
    });
    expect(body.created_at).toBeTruthy();
  });

  it('returns 404 when idea does not belong to authenticated user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/ideas/nonexistent',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns trend: null when trend row is missing', async () => {
    db.enqueue([mockIdea]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/ideas/${mockIdea.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().trend).toBeNull();
  });
});

describe('POST /ideas/:ideaId/approve', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let addJob: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = new MockDb();
    ({ app, addJob } = await buildApp(db));
    await ideaRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to approved, creates content_package, enqueues research-brief', async () => {
    db.enqueue([mockIdea]);
    db.enqueue([]);                     // update ideas
    db.enqueue([mockContentPackage]);   // insert content_package returning
    db.enqueue([mockTrend]);            // fetch trend for job payload
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/approve`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.idea_id).toBe(mockIdea.id);
    expect(body.status).toBe('approved');
    expect(body.content_package.id).toBe(mockContentPackage.id);
    expect(addJob).toHaveBeenCalledWith(
      'research-brief',
      expect.objectContaining({
        job_type: 'research_brief',
        user_id: USER_ID,
        content_package_id: mockContentPackage.id,
        idea: expect.objectContaining({ hook_line: mockIdea.hookLine }),
      }),
    );
  });

  it('returns 404 when idea is not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/ideas/ghost/approve',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when idea is already approved', async () => {
    db.enqueue([{ ...mockIdea, status: 'approved' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/approve`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('approved');
  });

  it('returns 400 when idea is rejected', async () => {
    db.enqueue([{ ...mockIdea, status: 'rejected' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/approve`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('falls back to idea.hookLine in domain_profile when trend is missing', async () => {
    db.enqueue([mockIdea]);
    db.enqueue([]);                   // update
    db.enqueue([mockContentPackage]); // insert
    db.enqueue([]);                   // trend not found
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/approve`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(addJob).toHaveBeenCalledWith(
      'research-brief',
      expect.objectContaining({
        domain_profile: expect.objectContaining({ primary_domain: mockIdea.hookLine }),
      }),
    );
  });
});

describe('POST /ideas/:ideaId/reject', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await ideaRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to rejected and responds with { idea_id, status }', async () => {
    db.enqueue([{ id: mockIdea.id, userId: USER_ID, status: 'pending' }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/reject`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { reason: 'Off brand' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ idea_id: mockIdea.id, status: 'rejected' });
  });

  it('omits rejection_reason when reason is absent from body', async () => {
    db.enqueue([{ id: mockIdea.id, userId: USER_ID, status: 'pending' }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/reject`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when idea not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/ideas/ghost/reject',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /ideas/:ideaId/defer', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await ideaRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to deferred and responds correctly', async () => {
    db.enqueue([{ id: mockIdea.id, userId: USER_ID }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/ideas/${mockIdea.id}/defer`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ idea_id: mockIdea.id, status: 'deferred' });
  });

  it('returns 404 when idea not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/ideas/ghost/defer',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
