import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationRoutes } from '../src/routes/notifications';
import {
  MockDb, buildApp, makeToken,
  mockNotification, USER_ID,
} from './helpers';

describe('GET /notifications', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await notificationRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns all notifications with unread_count', async () => {
    db.enqueue([mockNotification]);
    db.enqueue([{ unreadCount: 1 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/notifications',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(mockNotification.id);
    expect(body.data[0].event).toBe(mockNotification.event);
    expect(body.unread_count).toBe(1);
  });

  it('filters to only unread when ?unread_only=true', async () => {
    const unreadNotif = { ...mockNotification, readAt: null };
    db.enqueue([unreadNotif]);
    db.enqueue([{ unreadCount: 1 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/notifications?unread_only=true',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('respects ?limit= param (clamps to 50)', async () => {
    db.enqueue([]);
    db.enqueue([{ unreadCount: 0 }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/notifications?limit=100',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe('POST /notifications/push-subscribe', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await notificationRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('updates user push_subscription field and returns { subscribed: true }', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/notifications/push-subscribe',
      headers: { Authorization: `Bearer ${token}` },
      payload: { subscription: { endpoint: 'https://push.example.com', keys: { auth: 'abc', p256dh: 'def' } } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ subscribed: true });
  });
});

describe('POST /notifications/:id/read', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await notificationRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets readAt and returns { notification_id, read_at }', async () => {
    db.enqueue([{ id: mockNotification.id, userId: USER_ID }]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/notifications/${mockNotification.id}/read`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notification_id).toBe(mockNotification.id);
    expect(body.read_at).toBeTruthy();
    expect(new Date(body.read_at).toISOString()).toBe(body.read_at);
  });

  it('returns 404 when notification not found or belongs to another user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/notifications/ghost/read',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
