import Fastify from 'fastify';
import jwtPlugin from '@fastify/jwt';
import { vi } from 'vitest';
import { errorHandler } from '../src/lib/errors';

export const JWT_SECRET = 'super-secret-test-key-at-least-32-chars!';

export class MockDb {
  private _queue: any[] = [];

  enqueue(...items: any[]) {
    this._queue.push(...items);
    return this;
  }

  private pop() {
    return Promise.resolve(this._queue.shift() ?? []);
  }

  private makeSelectChain(p: Promise<any>): any {
    const chain: any = {
      then: (a: any, b?: any) => p.then(a, b),
      catch: (b: any) => p.catch(b),
      finally: (f: any) => p.finally(f),
    };
    const noop = () => chain;
    for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'leftJoin', 'innerJoin', 'groupBy']) {
      chain[m] = noop;
    }
    return chain;
  }

  select(_fields?: any): any {
    return this.makeSelectChain(this.pop());
  }

  insert(_table?: any): any {
    const pop = this.pop.bind(this);
    return {
      values: (_vals?: any) => {
        const p = pop();
        return {
          returning: () => p,
          onConflictDoUpdate: (_opts?: any) => ({
            returning: () => p,
            then: (a: any, b?: any) => p.then(a, b),
            catch: (b: any) => p.catch(b),
            finally: (f: any) => p.finally(f),
          }),
          then: (a: any, b?: any) => p.then(a, b),
          catch: (b: any) => p.catch(b),
          finally: (f: any) => p.finally(f),
        };
      },
    };
  }

  update(_table?: any): any {
    const pop = this.pop.bind(this);
    return {
      set: (_vals?: any) => ({
        where: (_cond?: any) => {
          const p = pop();
          return {
            returning: () => p,
            then: (a: any, b?: any) => p.then(a, b),
            catch: (b: any) => p.catch(b),
            finally: (f: any) => p.finally(f),
          };
        },
      }),
    };
  }

  delete(_table?: any): any {
    const pop = this.pop.bind(this);
    return { where: (_cond?: any) => pop() };
  }

  async transaction(fn: (tx: this) => Promise<any>) {
    return fn(this);
  }
}

const ALL_QUEUE_NAMES = [
  'trend-harvesting', 'idea-generation', 'research-brief', 'content-drafting',
  'draft-regeneration', 'visual-generation', 'visual-regeneration', 'export-package', 'notification-send',
] as const;

export type QueuesMock = Record<(typeof ALL_QUEUE_NAMES)[number], { add: ReturnType<typeof vi.fn> }>;

export function makeQueuesMock(): QueuesMock {
  return Object.fromEntries(
    ALL_QUEUE_NAMES.map((n) => [n, { add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) }])
  ) as QueuesMock;
}

export interface BuildOptions {
  queues?: QueuesMock;
  r2?: unknown;
  addJob?: ReturnType<typeof vi.fn>;
  aiClient?: unknown;
}

export async function buildApp(db: MockDb, opts: BuildOptions = {}) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret: JWT_SECRET });

  const queues = opts.queues ?? makeQueuesMock();
  const addJob = opts.addJob ?? vi.fn().mockResolvedValue(undefined);

  app.decorate('db', db as any);
  app.decorate('redis', {} as any);
  app.decorate('queues', queues as any);
  app.decorate('addJob', addJob as any);
  if (opts.r2) app.decorate('r2', opts.r2 as any);
  if (opts.aiClient) app.decorate('aiClient', opts.aiClient as any);
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
      request.user = { id: (request.user as any).sub, email: (request.user as any).email };
    } catch {
      void reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }
  });

  app.setErrorHandler(errorHandler);
  return { app, queues, addJob };
}

// Shared fixtures

export const USER_ID = 'user-abc';
export const USER_EMAIL = 'alice@example.com';

export function makeToken(app: Awaited<ReturnType<typeof buildApp>>['app'], userId = USER_ID, email = USER_EMAIL) {
  return app.jwt.sign({ sub: userId, email });
}

export const mockTrend = {
  id: 'trend-1',
  trendRunId: 'run-1',
  userId: USER_ID,
  topicName: 'AI in Healthcare',
  topicSlug: 'ai-in-healthcare',
  category: 'technology',
  sourcePlatform: 'x_twitter',
  compositeScore: '92.5',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockTrendRun = {
  id: 'run-1',
  userId: USER_ID,
  runDate: new Date('2024-01-01'),
  status: 'completed',
  stageTimings: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockIdea = {
  id: 'idea-1',
  trendId: 'trend-1',
  trendRunId: 'run-1',
  userId: USER_ID,
  angleType: 'news',
  hookLine: 'How AI is revolutionizing healthcare',
  coreArgument: 'AI enables faster diagnosis',
  platformFit: ['x_twitter', 'linkedin'],
  effortEstimate: 'medium',
  relevanceScore: '88.5',
  status: 'pending',
  rejectionReason: null,
  generationMeta: { model: 'claude-haiku', stub: false },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockContentPackage = {
  id: 'pkg-1',
  ideaId: 'idea-1',
  userId: USER_ID,
  status: 'pending',
  selectedFormats: ['x_thread', 'linkedin_article'],
  pipelineProgress: {},
  exportUrl: null,
  exportUrlExpiresAt: null,
  approvedAt: null,
  exportedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockDraft = {
  id: 'draft-1',
  contentPackageId: 'pkg-1',
  userId: USER_ID,
  format: 'x_thread',
  status: 'draft',
  contentBody: { hook_tweet: 'AI is changing healthcare', tweets: [], cta_tweet: 'Follow for more', hashtags: ['#AI'] },
  version: 1,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  generationMeta: { model: 'claude-haiku' },
  previousVersions: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockVisual = {
  id: 'visual-1',
  contentPackageId: 'pkg-1',
  userId: USER_ID,
  visualType: 'thumbnail',
  widthPx: 1280,
  heightPx: 720,
  generationMethod: 'ai_dalle',
  status: 'ready',
  r2Key: 'visuals/user-abc/pkg-1/thumbnail-123.jpg',
  cdnUrl: 'https://cdn.example.com/thumb.jpg',
  promptUsed: 'AI healthcare thumbnail',
  sourceUrl: 'https://dalle.example.com/img.jpg',
  brandKitApplied: false,
  version: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockBrief = {
  id: 'brief-1',
  contentPackageId: 'pkg-1',
  topicSummary: 'AI is transforming healthcare',
  keyFacts: [{ fact: 'AI improves diagnosis accuracy', source_url: 'https://example.com', confidence: 0.95 }],
  timeline: [{ date: '2024-01-01', event: 'Study published' }],
  keyPlayers: [{ name: 'Dr. Smith', role: 'Researcher', org: 'MIT' }],
  opposingViews: 'Some argue AI lacks empathy',
  regionalAngle: 'India has high adoption',
  relatedTopics: ['machine learning', 'diagnostics'],
  sources: [{ title: 'AI Study', url: 'https://example.com', publication: 'Nature', published_at: '2024-01-01' }],
  factCheckFlags: [],
  researchMeta: { model: 'perplexity', stub: false },
  createdAt: new Date('2024-01-01'),
};

export const mockDomainProfile = {
  id: 'dp-1',
  userId: USER_ID,
  primaryDomain: 'technology',
  subDomains: ['AI', 'healthcare'],
  targetAudience: 'tech professionals',
  creatorPersona: 'tech thought leader',
  toneOfVoice: ['professional', 'insightful'],
  contentMixRatio: { educational: 0.4, news: 0.3, opinion: 0.3 },
  region: 'IN-MH',
  inspirationAccounts: ['@techperson'],
  blacklistedTopics: [],
  updatedAt: new Date('2024-01-01'),
};

export const mockBrandKit = {
  id: 'bk-1',
  userId: USER_ID,
  logoR2Key: null,
  logoUrl: null,
  primaryColors: ['#1a1a2e', '#16213e'],
  fontPreferences: {},
  brandingMode: 'flexible' as const,
  extraAssets: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockNotification = {
  id: 'notif-1',
  userId: USER_ID,
  event: 'daily_digest_ready',
  channel: 'email',
  title: 'Your ideas are ready',
  body: 'Review and approve your trending ideas',
  payload: { trend_run_id: 'run-1' },
  sentAt: null,
  readAt: null,
  failedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};
