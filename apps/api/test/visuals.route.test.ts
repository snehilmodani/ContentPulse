import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visualRoutes } from '../src/routes/visuals';
import {
  MockDb, buildApp, makeToken,
  mockVisual, mockContentPackage, mockIdea, mockTrend, mockDomainProfile, mockBrandKit,
  USER_ID,
} from './helpers';

function makeAiClient(responseText = 'A vivid professional image prompt') {
  return {
    complete: vi.fn().mockResolvedValue({
      text: responseText,
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }),
  };
}

describe('POST /visuals/:visualId/prompt', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db, { aiClient: makeAiClient() }));
    await visualRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns 404 when visual not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/prompt`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns a prompt string built from idea + trend + brand context', async () => {
    db.enqueue([mockVisual]);          // visual
    db.enqueue([mockContentPackage]);  // package
    db.enqueue([mockIdea]);            // idea
    db.enqueue([mockTrend]);           // trend
    db.enqueue([mockDomainProfile]);   // domain profile
    db.enqueue([mockBrandKit]);        // brand kit
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/prompt`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt.length).toBeGreaterThan(0);
    // the mock aiClient returns a plain string so it should be passed through as-is
    expect(body.prompt).toBe('A vivid professional image prompt');
  });

  it('returns a fallback prompt when aiClient returns a [STUB] response', async () => {
    const aiClient = makeAiClient('[STUB] placeholder response');
    db = new MockDb();
    ({ app } = await buildApp(db, { aiClient }));
    await visualRoutes(app as any);

    db.enqueue([mockVisual]);
    db.enqueue([mockContentPackage]);
    db.enqueue([mockIdea]);
    db.enqueue([mockTrend]);
    db.enqueue([mockDomainProfile]);
    db.enqueue([mockBrandKit]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/prompt`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    // fallback contains the visual_type and 'social media'
    const { prompt } = res.json() as { prompt: string };
    expect(prompt).toContain(mockVisual.visualType.replace(/_/g, ' '));
    expect(prompt).toContain('social media');
  });
});

describe('GET /visuals/:visualId', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app } = await buildApp(db));
    await visualRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('returns full visual shape', async () => {
    db.enqueue([mockVisual]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: `/visuals/${mockVisual.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(mockVisual.id);
    expect(body.visual_type).toBe(mockVisual.visualType);
    expect(body.width_px).toBe(mockVisual.widthPx);
    expect(body.height_px).toBe(mockVisual.heightPx);
    expect(body.generation_method).toBe(mockVisual.generationMethod);
    expect(body.cdn_url).toBe(mockVisual.cdnUrl);
    expect(body.created_at).toBeTruthy();
  });

  it('returns 404 when visual not found or belongs to another user', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'GET', url: '/visuals/ghost',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /visuals/:visualId/regenerate', () => {
  let db: MockDb;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let queues: Awaited<ReturnType<typeof buildApp>>['queues'];

  beforeEach(async () => {
    db = new MockDb();
    ({ app, queues } = await buildApp(db));
    await visualRoutes(app as any);
  });

  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it('sets status to regenerating, enqueues visual-generation job, responds 202', async () => {
    db.enqueue([mockVisual]);
    db.enqueue([]);   // update status
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.visual_id).toBe(mockVisual.id);
    expect(body.status).toBe('regenerating');
    expect(body.job_id).toBeTruthy();
    expect(queues['visual-generation'].add).toHaveBeenCalledWith(
      'visual_regeneration',
      expect.objectContaining({
        job_type: 'visual_regeneration',
        visual_id: mockVisual.id,
        user_id: USER_ID,
        content_package_id: mockVisual.contentPackageId,
      }),
    );
  });

  it('passes optional instruction and override_method in job payload when present', async () => {
    db.enqueue([mockVisual]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { instruction: 'Use darker tones', generation_method: 'web_unsplash' },
    });

    expect(res.statusCode).toBe(202);
    expect(queues['visual-generation'].add).toHaveBeenCalledWith(
      'visual_regeneration',
      expect.objectContaining({
        instruction: 'Use darker tones',
        override_method: 'web_unsplash',
      }),
    );
  });

  it('omits optional fields when absent from body', async () => {
    db.enqueue([mockVisual]);
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(202);
    const payload = (queues['visual-generation'].add as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect('instruction' in payload).toBe(false);
    expect('override_method' in payload).toBe(false);
  });

  it('returns 404 when visual not found', async () => {
    db.enqueue([]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: '/visuals/ghost/regenerate',
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when visual status is already regenerating', async () => {
    db.enqueue([{ ...mockVisual, status: 'regenerating' }]);
    const token = makeToken(app);

    const res = await app.inject({
      method: 'POST', url: `/visuals/${mockVisual.id}/regenerate`,
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('regenerating');
  });
});
