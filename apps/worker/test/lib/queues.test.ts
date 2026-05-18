import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, createQueues } from '../../src/lib/queues';

vi.mock('bullmq', () => {
  class Queue {
    name: string;
    opts: unknown;
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
    }
  }
  class Worker {
    on = vi.fn().mockReturnThis();
  }
  return { Queue, Worker };
});

describe('QUEUE_NAMES', () => {
  const expected = [
    'trend-harvesting',
    'idea-generation',
    'research-brief',
    'content-drafting',
    'draft-regeneration',
    'visual-generation',
    'visual-regeneration',
    'export-package',
    'notification-send',
  ] as const;

  it('contains all 9 expected queue names', () => {
    expect(QUEUE_NAMES).toHaveLength(9);
  });

  it('contains each expected queue name', () => {
    for (const name of expected) {
      expect(QUEUE_NAMES).toContain(name);
    }
  });
});

describe('DEFAULT_JOB_OPTIONS', () => {
  it('has 3 retry attempts', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
  });

  it('removes completed jobs after 7 days (604800 seconds)', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toMatchObject({ age: 86400 * 7 });
  });

  it('does not remove failed jobs', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });
});

describe('createQueues', () => {
  it('creates one Queue instance per queue name', () => {
    const redis = {} as any;
    const queues = createQueues(redis);
    for (const name of QUEUE_NAMES) {
      expect(queues[name]).toBeDefined();
      expect((queues[name] as any).name).toBe(name);
    }
  });

  it('returns exactly 9 queues', () => {
    const redis = {} as any;
    const queues = createQueues(redis);
    expect(Object.keys(queues)).toHaveLength(9);
  });
});
