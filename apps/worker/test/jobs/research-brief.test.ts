import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/ws-publish', () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/adapters/perplexity', () => ({
  PerplexityClient: vi.fn().mockImplementation(() => ({
    research: vi.fn().mockResolvedValue({
      topic_summary: 'AI is transforming healthcare',
      key_facts: [{ fact: 'AI helps diagnosis', source_url: 'https://example.com', confidence: 0.9 }],
      timeline: [{ date: '2024-01-01', event: 'Study published' }],
      key_players: [{ name: 'Dr. Smith', role: 'Researcher', org: 'MIT' }],
      opposing_views: 'Some disagree',
      regional_angle: 'India specific',
      related_topics: ['ML', 'diagnostics'],
      sources: [{ title: 'Study', url: 'https://example.com', publication: 'Nature', published_at: '2024-01-01' }],
      fact_check_flags: [],
    }),
  })),
}));

import { processResearchBrief } from '../../src/jobs/research-brief/index';
import { publishToUser } from '../../src/lib/ws-publish';
import { PerplexityClient } from '../../src/adapters/perplexity';

const mockPublish = vi.mocked(publishToUser);

function makeDb(queue: any[] = []) {
  const db = {
    _queue: queue,
    select: function () {
      const p = Promise.resolve(this._queue.shift() ?? []);
      const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
      const noop = () => chain;
      for (const m of ['from', 'where', 'limit']) chain[m] = noop;
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

function makeDeps(envOverrides: Record<string, string> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const redis = { publish: vi.fn().mockResolvedValue(1) } as any;
  const queues = {
    'content-drafting': { add: vi.fn().mockResolvedValue({ id: 'cd-1' }) },
    'visual-generation': { add: vi.fn().mockResolvedValue({ id: 'vg-1' }) },
  } as any;
  const env = {
    OPENROUTER_API_KEY: 'sk-test',
    AI_MODEL_RESEARCH: 'test-model',
    BYPASS_RESEARCH: 'false',
    ...envOverrides,
  };
  return { db: makeDb(), redis, queues, logger: logger as any, env };
}

const basePayload = {
  job_type: 'research_brief' as const,
  user_id: 'u1',
  content_package_id: 'pkg-1',
  idea_id: 'idea-1',
  idea: { hook_line: 'AI in healthcare', core_argument: 'faster diagnosis', angle_type: 'news' as const },
  domain_profile: { primary_domain: 'technology', region: 'IN-MH', tone_of_voice: ['professional'] as string[] },
};

const mockBriefRow = {
  id: 'brief-1',
  contentPackageId: 'pkg-1',
  topicSummary: 'AI is transforming healthcare',
  keyFacts: [],
  timeline: [],
  keyPlayers: [],
  opposingViews: null,
  regionalAngle: null,
  relatedTopics: [],
  sources: [],
  factCheckFlags: [],
};

beforeEach(() => {
  mockPublish.mockClear();
  vi.mocked(PerplexityClient).mockClear();
});

afterEach(() => { vi.clearAllMocks(); });

describe('processResearchBrief — bypass mode', () => {
  it('uses stub data without calling perplexity.research, inserts brief, chains downstream jobs', async () => {
    const deps = makeDeps({ BYPASS_RESEARCH: 'true' });
    deps.db._queue = [
      [],               // update contentPackages to 'researching'
      [mockBriefRow],   // topicBriefs insert returning
      [],               // update contentPackages to 'drafting'
    ];

    await processResearchBrief(basePayload, deps);

    const instance = vi.mocked(PerplexityClient).mock.results[0]?.value as any;
    expect(instance?.research ?? vi.fn()).not.toHaveBeenCalled();

    expect(deps.queues['content-drafting'].add).toHaveBeenCalledWith(
      'content_drafting',
      expect.objectContaining({ job_type: 'content_drafting', content_package_id: 'pkg-1' }),
    );
    expect(deps.queues['visual-generation'].add).toHaveBeenCalledWith(
      'visual_generation',
      expect.objectContaining({ job_type: 'visual_generation', content_package_id: 'pkg-1' }),
    );
  });
});

describe('processResearchBrief — real Perplexity call', () => {
  it('calls perplexity.research, inserts topic brief, chains both downstream queues', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [],               // update to 'researching'
      [mockBriefRow],   // topicBriefs insert returning
      [],               // update to 'drafting'
    ];

    await processResearchBrief(basePayload, deps);

    const instance = vi.mocked(PerplexityClient).mock.results[0]!.value as any;
    expect(instance.research).toHaveBeenCalledWith('AI in healthcare', 'IN-MH');

    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_started' }),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      expect.objectContaining({ event: 'pipeline_stage_completed' }),
    );
    expect(deps.queues['content-drafting'].add).toHaveBeenCalledOnce();
    expect(deps.queues['visual-generation'].add).toHaveBeenCalledOnce();
  });
});

describe('processResearchBrief — Perplexity error', () => {
  it('marks contentPackage as rejected and re-throws when research fails', async () => {
    const researchError = new Error('Perplexity 503');
    vi.mocked(PerplexityClient).mockImplementationOnce(() => ({
      research: vi.fn().mockRejectedValue(researchError),
    }) as any);

    const deps = makeDeps();
    deps.db._queue = [
      [],  // update to 'researching'
      [],  // update to 'rejected' (error path)
    ];

    await expect(processResearchBrief(basePayload, deps)).rejects.toThrow('Perplexity 503');
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ contentPackageId: 'pkg-1' }),
      expect.any(String),
    );
  });
});
