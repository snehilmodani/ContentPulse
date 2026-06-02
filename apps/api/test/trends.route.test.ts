import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trendRoutes } from '../src/routes/trends';
import {
  MockDb, buildApp, makeToken,
  mockTrend, mockTrendRun, mockIdea, mockDomainProfile,
} from './helpers';

describe('POST /trend-runs', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let addJob: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = new MockDb();
    ({ app, addJob } = await buildApp(db));
    await trendRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns 400 when trend_cap is out of range (> 20)', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: { trend_cap: 25 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('trend_cap');
  });

  it('returns 400 when trend_cap is less than 1', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: { trend_cap: 0 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when domain_override.primary_domain is an empty string', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: { domain_override: { primary_domain: '  ' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('primary_domain');
  });

  it('returns 404 when the user has no domain profile', async () => {
    db.enqueue([]);  // domain profile select returns empty
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });

  it('creates a trend run, enqueues trend-harvesting, returns 201', async () => {
    db.enqueue([mockDomainProfile]);
    db.enqueue([{ id: 'run-new', status: 'pending', runDate: '2024-01-15' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe('run-new');
    expect(body.status).toBe('pending');
    expect(addJob).toHaveBeenCalledWith(
      'trend-harvesting',
      expect.objectContaining({
        job_type: 'trend_harvesting',
        trend_run_id: 'run-new',
        domain_profile: expect.objectContaining({
          primary_domain: mockDomainProfile.primaryDomain,
        }),
      }),
    );
  });

  it('includes trend_cap in the job payload when provided', async () => {
    db.enqueue([mockDomainProfile]);
    db.enqueue([{ id: 'run-cap', status: 'pending', runDate: '2024-01-15' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
      payload: { trend_cap: 5 },
    });

    expect(res.statusCode).toBe(201);
    expect(addJob).toHaveBeenCalledWith(
      'trend-harvesting',
      expect.objectContaining({ trend_cap: 5 }),
    );
  });
});

describe('GET /trend-runs', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await trendRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns paginated list with meta: { page, limit, total }', async () => {
    db.enqueue([mockTrendRun]);      // runs list
    db.enqueue([{ total: 1 }]);      // total count
    db.enqueue([{ total: 2 }]);      // trend_count per run
    db.enqueue([{ total: 3 }]);      // idea_count per run
    db.enqueue([{ total: 1 }]);      // pending_idea_count per run
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: mockTrendRun.id,
      status: mockTrendRun.status,
      trend_count: 2,
      idea_count: 3,
      pending_idea_count: 1,
    });
  });

  it('respects page and limit query params', async () => {
    db.enqueue([mockTrendRun]);
    db.enqueue([{ total: 5 }]);
    db.enqueue([{ total: 0 }]);
    db.enqueue([{ total: 0 }]);
    db.enqueue([{ total: 0 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs?page=2&limit=5',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toMatchObject({ page: 2, limit: 5 });
  });

  it('clamps limit to max 50', async () => {
    db.enqueue([]);
    db.enqueue([{ total: 0 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs?limit=999',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().meta.limit).toBe(50);
  });

  it('returns empty data: [] when user has no runs', async () => {
    db.enqueue([]);
    db.enqueue([{ total: 0 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    expect(res.json().meta.total).toBe(0);
  });
});

describe('GET /trend-runs/:runId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await trendRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns run with nested trends array including idea_count', async () => {
    db.enqueue([mockTrendRun]);     // run lookup
    db.enqueue([mockTrend]);        // trends list
    db.enqueue([{ total: 15 }]);   // ideaCountRows (total ideas for run)
    db.enqueue([{ total: 10 }]);   // pendingCountRows (pending ideas for run)
    db.enqueue([{ total: 4 }]);    // per-trend idea count
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/trend-runs/${mockTrendRun.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockTrendRun.id);
    expect(body.idea_count).toBe(15);
    expect(body.pending_idea_count).toBe(10);
    expect(body.trends).toHaveLength(1);
    expect(body.trends[0]).toMatchObject({
      id: mockTrend.id,
      topic_name: mockTrend.topicName,
      idea_count: 4,
    });
  });

  it('returns 404 when run not found or belongs to different user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs/ghost',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /trend-runs/:runId/ideas', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await trendRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns paginated ideas with nested trend and meta', async () => {
    db.enqueue([{ id: 'run-1' }]);   // run lookup
    db.enqueue([mockIdea]);           // ideas list
    db.enqueue([{ total: 1 }]);       // total count
    db.enqueue([mockTrend]);          // trend for the idea
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/trend-runs/${mockTrendRun.id}/ideas`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(mockIdea.id);
    expect(body.data[0].trend.id).toBe(mockTrend.id);
    expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('filters by status query param when provided', async () => {
    db.enqueue([{ id: 'run-1' }]);
    db.enqueue([{ ...mockIdea, status: 'pending' }]);
    db.enqueue([{ total: 1 }]);
    db.enqueue([mockTrend]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/trend-runs/${mockTrendRun.id}/ideas?status=pending`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].status).toBe('pending');
  });

  it('returns 404 when parent run is not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/trend-runs/ghost/ideas',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
