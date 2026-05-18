import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userRoutes } from '../src/routes/users';
import {
  MockDb, buildApp, makeToken,
  mockDomainProfile, USER_ID,
} from './helpers';

const mockR2 = { upload: vi.fn().mockResolvedValue('https://cdn.example.com/logo.png') };

describe('GET /users/:userId/domain-profile', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { r2: mockR2 }));
    await userRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns domain profile for the authenticated user', async () => {
    db.enqueue([mockDomainProfile]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/users/${USER_ID}/domain-profile`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockDomainProfile.id);
    expect(body.primary_domain).toBe(mockDomainProfile.primaryDomain);
    expect(body.tone_of_voice).toEqual(mockDomainProfile.toneOfVoice);
    expect(body.updated_at).toBeTruthy();
  });

  it('returns 403 when :userId is a different user', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/users/other-user/domain-profile',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when no domain profile has been created yet', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/users/${USER_ID}/domain-profile`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /users/:userId/domain-profile', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { r2: mockR2 }));
    await userRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('creates domain profile via upsert and returns full response', async () => {
    db.enqueue([mockDomainProfile]);   // insert/onConflictDoUpdate returning
    db.enqueue([]);                    // update user onboarding
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PUT', url: `/users/${USER_ID}/domain-profile`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        primary_domain: 'technology',
        sub_domains: ['AI'],
        tone_of_voice: ['professional'],
        content_mix_ratio: { news: 0.5 },
        inspiration_accounts: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockDomainProfile.id);
    expect(body.primary_domain).toBe(mockDomainProfile.primaryDomain);
  });

  it("returns 403 when :userId doesn't match authenticated user", async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PUT', url: '/users/other-user/domain-profile',
      headers: { Authorization: `Bearer ${token}` },
      payload: { primary_domain: 'tech', sub_domains: [], tone_of_voice: [], content_mix_ratio: {}, inspiration_accounts: [] },
    });

    expect(res.statusCode).toBe(403);
  });
});

const mockBrandKit = {
  id: 'bk-1',
  userId: USER_ID,
  logoR2Key: null,
  logoUrl: null,
  primaryColors: ['#FF5733'],
  fontPreferences: { heading: 'Inter' },
  brandingMode: 'flexible',
  extraAssets: [],
  updatedAt: new Date('2024-01-01'),
};

describe('GET /users/:userId/brand-kit', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { r2: mockR2 }));
    await userRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns brand kit for the authenticated user', async () => {
    db.enqueue([mockBrandKit]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/users/${USER_ID}/brand-kit`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('bk-1');
    expect(body.primary_colors).toEqual(['#FF5733']);
    expect(body.branding_mode).toBe('flexible');
    expect(body.updated_at).toBeTruthy();
  });

  it('returns 403 when :userId is a different user', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/users/other-user/brand-kit',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when no brand kit has been created yet', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/users/${USER_ID}/brand-kit`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /users/:userId/brand-kit', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { r2: mockR2 }));
    await userRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('upserts brand kit and returns full response', async () => {
    db.enqueue([mockBrandKit]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PUT', url: `/users/${USER_ID}/brand-kit`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { primary_colors: ['#FF5733'], font_preferences: { heading: 'Inter' }, branding_mode: 'flexible', extra_assets: [] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('bk-1');
    expect(body.primary_colors).toEqual(['#FF5733']);
  });

  it('returns 403 when :userId does not match authenticated user', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PUT', url: '/users/other-user/brand-kit',
      headers: { Authorization: `Bearer ${token}` },
      payload: { primary_colors: [], font_preferences: {}, branding_mode: 'flexible', extra_assets: [] },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /users/:userId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { r2: mockR2 }));
    await userRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('updates display_name and timezone and returns updated user', async () => {
    db.enqueue([{ id: USER_ID, displayName: 'Alice Updated', timezone: 'Asia/Kolkata' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PATCH', url: `/users/${USER_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { display_name: 'Alice Updated', timezone: 'Asia/Kolkata' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.display_name).toBe('Alice Updated');
    expect(body.timezone).toBe('Asia/Kolkata');
  });

  it('returns 403 when :userId does not match authenticated user', async () => {
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PATCH', url: '/users/other-user',
      headers: { Authorization: `Bearer ${token}` },
      payload: { display_name: 'Hacker' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when user row not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'PATCH', url: `/users/${USER_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { display_name: 'Ghost' },
    });

    expect(res.statusCode).toBe(404);
  });
});
