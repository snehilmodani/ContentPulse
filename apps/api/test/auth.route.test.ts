import Fastify from 'fastify';
import jwtPlugin from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authRoutes } from '../src/routes/auth';
import { errorHandler } from '../src/lib/errors';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

const JWT_SECRET = 'super-secret-test-key-at-least-32-chars!';

const mockUser = {
  id: 'user-abc',
  email: 'alice@example.com',
  passwordHash: '$2a$12$hashed',
  displayName: 'Alice',
  avatarUrl: null,
  timezone: 'UTC',
  onboardingComplete: false,
  emailNotifications: true,
  pushNotifications: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  supabaseUid: null,
};

const mockRefreshToken = {
  id: 'rt-1',
  userId: 'user-abc',
  token: 'refresh-token-value',
  family: 'family-1',
  revoked: false,
  expiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
  createdAt: new Date(),
};

class MockDb {
  private _queue: any[] = [];

  enqueue(...items: any[]) {
    this._queue.push(...items);
    return this;
  }

  private pop() {
    return Promise.resolve(this._queue.shift() ?? []);
  }

  select() {
    const pop = this.pop.bind(this);
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => pop(),
    };
    return chain;
  }

  insert() {
    const pop = this.pop.bind(this);
    return {
      values: () => {
        const p = pop();
        return {
          returning: () => p,
          then: (onFulfilled: any, onRejected: any) => p.then(onFulfilled, onRejected),
          catch: (onRejected: any) => p.catch(onRejected),
          finally: (onFinally: any) => p.finally(onFinally),
        };
      },
    };
  }

  update() {
    const pop = this.pop.bind(this);
    return { set: () => ({ where: () => pop() }) };
  }

  async transaction(fn: (tx: this) => Promise<any>) {
    return fn(this);
  }
}

async function buildApp(db: MockDb) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });

  app.decorate('db', db as any);
  app.decorate('authenticate', async function (this: typeof app, request: any, reply: any) {
    try {
      await request.jwtVerify();
      request.user = { id: (request.user as any).sub, email: (request.user as any).email };
    } catch {
      void reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }
  });

  app.setErrorHandler(errorHandler);
  await authRoutes(app as any);
  return app;
}

describe('POST /auth/register', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new MockDb();
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('registers a new user and returns tokens', async () => {
    db.enqueue([]);           // no existing user
    db.enqueue([mockUser]);   // insert user returning
    db.enqueue([]);           // insert refresh token

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'Alice@Example.COM', password: 'pass1234', display_name: 'Alice' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.session.access_token).toBeTruthy();
    expect(body.session.refresh_token).toBeTruthy();
  });

  it('returns 400 when email is already registered', async () => {
    db.enqueue([{ id: 'existing' }]); // existing user

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'pass1234' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('already registered');
  });
});

describe('POST /auth/login', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new MockDb();
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('logs in with correct credentials and returns tokens', async () => {
    db.enqueue([mockUser]); // user found
    db.enqueue([]);         // insert refresh token

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'correct-password' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe('user-abc');
    expect(body.session.access_token).toBeTruthy();
  });

  it('returns 400 when user is not found', async () => {
    db.enqueue([]); // no user

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'pass' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Invalid credentials');
  });

  it('returns 400 when password is wrong', async () => {
    const bcrypt = await import('bcryptjs');
    vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as any);
    db.enqueue([mockUser]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Invalid credentials');
  });
});

describe('GET /auth/me', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new MockDb();
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the authenticated user', async () => {
    db.enqueue([mockUser]);
    const token = app.jwt.sign({ sub: 'user-abc', email: 'alice@example.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('user-abc');
    expect(body.email).toBe('alice@example.com');
    expect(body.created_at).toBeTruthy();
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user no longer exists', async () => {
    db.enqueue([]); // user not found in DB
    const token = app.jwt.sign({ sub: 'ghost', email: 'ghost@example.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /auth/refresh', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new MockDb();
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rotates the refresh token and returns new tokens', async () => {
    db.enqueue([mockRefreshToken]); // find token
    db.enqueue([]);                 // revoke old family
    db.enqueue([mockUser]);         // find user
    db.enqueue([]);                 // insert new refresh token

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'refresh-token-value' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
  });

  it('returns 401 when token not found', async () => {
    db.enqueue([]); // token not found

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'unknown-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is revoked', async () => {
    db.enqueue([{ ...mockRefreshToken, revoked: true }]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'refresh-token-value' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is expired', async () => {
    db.enqueue([{ ...mockRefreshToken, expiresAt: new Date(Date.now() - 1000) }]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'refresh-token-value' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    db = new MockDb();
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
  });

  it('revokes all refresh tokens and returns 204', async () => {
    db.enqueue([]); // update revoke
    const token = app.jwt.sign({ sub: 'user-abc', email: 'alice@example.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(401);
  });
});
