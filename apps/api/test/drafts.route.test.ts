import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { draftRoutes } from '../src/routes/drafts';
import {
  MockDb, buildApp, makeToken,
  mockDraft, USER_ID,
} from './helpers';

describe('GET /drafts/:draftId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await draftRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns full draft shape including nullable fields', async () => {
    db.enqueue([mockDraft]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/drafts/${mockDraft.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockDraft.id);
    expect(body.format).toBe(mockDraft.format);
    expect(body.status).toBe(mockDraft.status);
    expect(body.approved_at).toBeNull();
    expect(body.rejected_at).toBeNull();
    expect(body.rejection_reason).toBeNull();
    expect(body.created_at).toBeTruthy();
  });

  it('returns 404 when draft not found or belongs to another user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/drafts/ghost',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /drafts/:draftId/regenerate', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let queues: Awaited<ReturnType<typeof buildApp>>['queues'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app, queues } = await buildApp(db));
    await draftRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to regenerating, enqueues draft-regeneration job, responds 202', async () => {
    db.enqueue([mockDraft]);
    db.enqueue([{ id: 'brief-1' }]); // topic brief
    db.enqueue([]);                   // update status
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/drafts/${mockDraft.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { instruction: 'Make it punchier' },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.draft_id).toBe(mockDraft.id);
    expect(body.status).toBe('regenerating');
    expect(body.job_id).toBeTruthy();
    expect(queues['draft-regeneration'].add).toHaveBeenCalledWith(
      'draft_regeneration',
      expect.objectContaining({
        job_type: 'draft_regeneration',
        draft_id: mockDraft.id,
        topic_brief_id: 'brief-1',
        instruction: 'Make it punchier',
      }),
    );
  });

  it('falls back to empty topic_brief_id when no brief exists', async () => {
    db.enqueue([mockDraft]);
    db.enqueue([]);   // no brief
    db.enqueue([]);   // update
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/drafts/${mockDraft.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { instruction: 'Rewrite' },
    });

    expect(res.statusCode).toBe(202);
    expect(queues['draft-regeneration'].add).toHaveBeenCalledWith(
      'draft_regeneration',
      expect.objectContaining({ topic_brief_id: '' }),
    );
  });

  it('returns 404 when draft not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/drafts/ghost/regenerate',
      headers: { Authorization: `Bearer ${token}` },
      payload: { instruction: 'Rewrite' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /drafts/:draftId/approve', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await draftRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to approved and returns approved_at in ISO format', async () => {
    db.enqueue([{ id: mockDraft.id, userId: USER_ID }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/drafts/${mockDraft.id}/approve`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.draft_id).toBe(mockDraft.id);
    expect(body.status).toBe('approved');
    expect(body.approved_at).toBeTruthy();
    // Should be a valid ISO string
    expect(new Date(body.approved_at).toISOString()).toBe(body.approved_at);
  });

  it('returns 404 when draft not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/drafts/ghost/approve',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /drafts/:draftId/reject', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await draftRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to rejected and returns { draft_id, status }', async () => {
    db.enqueue([{ id: mockDraft.id, userId: USER_ID }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/drafts/${mockDraft.id}/reject`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { reason: 'Too long' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ draft_id: mockDraft.id, status: 'rejected' });
  });

  it('persists rejection_reason when body contains reason', async () => {
    db.enqueue([{ id: mockDraft.id, userId: USER_ID }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/drafts/${mockDraft.id}/reject`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { reason: 'Off brand' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when draft not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/drafts/ghost/reject',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
