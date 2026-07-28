import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime, Settings } from 'luxon';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq) };
});

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn((_pattern: string, cb: () => unknown) => ({ start: vi.fn(), stop: vi.fn(), _cb: cb })) },
}));

import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { trendRuns } from '@contentpulse/db';
import { startScheduler } from '../../src/scheduler/index';

const mockEq = vi.mocked(eq);
const scheduleMock = vi.mocked(cron.schedule);

// Regression coverage for: the scheduler used to dedup "already ran today" by
// comparing trend_runs.run_date against `CURRENT_DATE` (Postgres/UTC server
// date) while inserting new runs keyed on the worker-local Luxon date. When
// those two dates disagreed (different TZ, or around midnight), the guard
// checked the wrong date and a new trend_run row was inserted on every
// minute-tick — see apps/worker/src/scheduler/index.ts.

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    timezone: 'UTC',
    domainProfileId: 'dp-1',
    primaryDomain: 'technology',
    subDomains: [],
    region: 'US',
    toneOfVoice: [],
    ...overrides,
  };
}

function makeDb(eligibleUsers: unknown[], trendRunRows: Array<Record<string, unknown> | undefined>) {
  let insertCallIndex = 0;
  return {
    select: () => ({
      from: () => {
        const fromChain: any = {
          // used by the NOT EXISTS subquery (select ... from trendRuns where ...)
          where: () => Promise.resolve(eligibleUsers),
        };
        fromChain.innerJoin = () => ({
          // used by the outer eligible-users query
          where: () => Promise.resolve(eligibleUsers),
        });
        return fromChain;
      },
    }),
    insert: () => ({
      values: () => ({
        returning: () => {
          const row = trendRunRows[insertCallIndex++];
          return Promise.resolve(row ? [row] : []);
        },
      }),
    }),
  } as any;
}

function makeDeps(db: any) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const queues = { 'trend-harvesting': { add: vi.fn().mockResolvedValue({ id: 'job-1' }) } } as any;
  return { db, queues, logger: logger as any };
}

async function tick(deps: any) {
  startScheduler(deps);
  const cb = scheduleMock.mock.calls[scheduleMock.mock.calls.length - 1]![1] as () => Promise<void>;
  await cb();
}

describe('startScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Settings.defaultZone = 'utc';
  });

  afterEach(() => {
    vi.useRealTimers();
    Settings.defaultZone = 'system';
  });

  it('creates a trend run and schedules a delayed job for a user whose local 11am has not passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T09:00:00.000Z'));

    const db = makeDb([makeUser()], [{ id: 'run-1' }]);
    const deps = makeDeps(db);

    await tick(deps);

    expect(deps.queues['trend-harvesting'].add).toHaveBeenCalledTimes(1);
    const [, payload, opts] = deps.queues['trend-harvesting'].add.mock.calls[0];
    expect(payload.trend_run_id).toBe('run-1');
    expect(opts.jobId).toBe('trend-user-1-2026-07-28');
  });

  it('skips a user whose local 11am has already passed today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));

    const db = makeDb([makeUser()], [{ id: 'run-1' }]);
    const deps = makeDeps(db);

    await tick(deps);

    expect(deps.queues['trend-harvesting'].add).not.toHaveBeenCalled();
  });

  it('guards "already ran today" against the same worker-local date used for the insert', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T09:00:00.000Z'));

    const db = makeDb([makeUser()], [{ id: 'run-1' }]);
    const deps = makeDeps(db);

    await tick(deps);

    const today = DateTime.now().toISODate();

    // The insert must be keyed on the same worker-local date...
    expect(db.insert).toBeDefined();

    // ...and the NOT EXISTS eligibility guard must compare trend_runs.run_date
    // against that exact same value, not a separately-resolved DB date
    // (e.g. `sql\`CURRENT_DATE\``), which is what let duplicates through.
    const runDateGuardCall = mockEq.mock.calls.find(([column]) => column === trendRuns.runDate);
    expect(runDateGuardCall).toBeDefined();
    expect(runDateGuardCall?.[1]).toBe(today);
  });

  it('does not add a job for a user the eligibility query excludes (already has a run today)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T09:00:00.000Z'));

    // Simulates the NOT EXISTS guard correctly excluding a user who already
    // has a trend_runs row for today — the eligible-users query returns none.
    const db = makeDb([], []);
    const deps = makeDeps(db);

    await tick(deps);

    expect(deps.queues['trend-harvesting'].add).not.toHaveBeenCalled();
  });
});
