import { describe, expect, it, vi } from 'vitest';

let capturedName: string;
let capturedProcessor: ((job: any) => Promise<void>) | null = null;
let capturedOpts: Record<string, unknown> = {};
let onHandlers: Map<string, (...args: any[]) => void> = new Map();

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
    on = vi.fn((event: string, handler: (...args: any[]) => void) => {
      onHandlers.set(event, handler);
      return this;
    });

    constructor(name: string, processor: (job: any) => Promise<void>, opts: Record<string, unknown>) {
      capturedName = name;
      capturedProcessor = processor;
      capturedOpts = opts;
    }
  }

  return { Queue, Worker };
});

import { createWorker } from '../../src/lib/queues';

function makeDeps() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const redis = {} as any;
  return { logger, redis };
}

describe('createWorker', () => {
  it('passes lockDuration=120_000 and maxStalledCount=3 to BullMQ Worker', () => {
    capturedOpts = {};
    const { logger, redis } = makeDeps();
    createWorker('idea-generation', redis, 1, vi.fn(), logger as any);
    expect(capturedOpts.lockDuration).toBe(120_000);
    expect(capturedOpts.maxStalledCount).toBe(3);
  });

  it('calls the processor with the job typed data', async () => {
    capturedProcessor = null;
    const { logger, redis } = makeDeps();
    const processor = vi.fn().mockResolvedValue(undefined);
    createWorker('idea-generation', redis, 1, processor, logger as any);

    const fakeJob = { id: 'job-1', data: { job_type: 'idea_generation', user_id: 'u1' } };
    await capturedProcessor!(fakeJob);

    expect(processor).toHaveBeenCalledWith(fakeJob);
  });

  it('logs job picked up and job completed with duration_ms', async () => {
    capturedProcessor = null;
    const { logger, redis } = makeDeps();
    const processor = vi.fn().mockResolvedValue(undefined);
    createWorker('idea-generation', redis, 1, processor, logger as any);

    const fakeJob = { id: 'job-99', data: { job_type: 'idea_generation', user_id: 'u1' } };
    await capturedProcessor!(fakeJob);

    const pickupCall = logger.info.mock.calls.find((c: any[]) => JSON.stringify(c).includes('job picked up'));
    const completedCall = logger.info.mock.calls.find((c: any[]) => JSON.stringify(c).includes('job completed'));

    expect(pickupCall).toBeDefined();
    expect(completedCall).toBeDefined();

    const completedMeta = completedCall![0] as Record<string, unknown>;
    expect(typeof completedMeta.duration_ms).toBe('number');
  });

  it("worker's failed event handler calls logger.error with queue, jobId, and err", () => {
    onHandlers = new Map();
    const { logger, redis } = makeDeps();
    createWorker('idea-generation', redis, 1, vi.fn(), logger as any);

    const failedHandler = onHandlers.get('failed');
    expect(failedHandler).toBeDefined();

    const fakeErr = new Error('job exploded');
    failedHandler!({ id: 'job-fail' }, fakeErr);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'idea-generation', jobId: 'job-fail', err: fakeErr }),
      'job failed',
    );
  });
});
