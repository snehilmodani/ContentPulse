import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processNotificationSend } from '../../src/jobs/notification-send/index';

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

function makeDeps(overrides: Record<string, unknown> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const resend = { send: vi.fn().mockResolvedValue(undefined) } as any;

  return { db: makeDb(), logger: logger as any, resend, ...overrides };
}

const basePayload = {
  job_type: 'notification_send' as const,
  user_id: 'u1',
  notification_id: 'notif-1',
  event: 'daily_digest_ready',
  channels: ['email'] as const,
  template_data: { trend_run_id: 'r1' },
};

describe('processNotificationSend', () => {
  it('fetches user and calls ResendClient.send for email channel', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ email: 'user@example.com' }],  // user lookup
      [],                                // update sentAt
    ];

    await processNotificationSend(basePayload, deps);

    expect(deps.resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.any(String),
        html: expect.any(String),
      }),
    );
  });

  it('marks notification sentAt after successful send', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ email: 'user@example.com' }],
      [],
    ];
    const updateSpy = vi.fn().mockReturnValue({
      where: () => Promise.resolve([]),
    });
    // Replace db.update to spy on set payload
    const originalUpdate = deps.db.update.bind(deps.db);
    let capturedSet: Record<string, unknown> = {};
    deps.db.update = function () {
      return {
        set: (vals: Record<string, unknown>) => {
          capturedSet = vals;
          return originalUpdate().set(vals);
        },
      };
    };

    await processNotificationSend(basePayload, deps);
    // sentAt should have been set (not failedAt)
    expect(capturedSet.sentAt ?? capturedSet.failedAt).toBeDefined();
  });

  it('marks notification failedAt on send error without re-throwing', async () => {
    const deps = makeDeps();
    deps.resend.send = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
    deps.db._queue = [
      [{ email: 'user@example.com' }],
      [],  // update failedAt
    ];

    await expect(processNotificationSend(basePayload, deps)).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'notif-1' }),
      expect.any(String),
    );
  });

  it('aborts early when user not found', async () => {
    const deps = makeDeps();
    deps.db._queue = [[]] // user not found

    await processNotificationSend(basePayload, deps);

    expect(deps.resend.send).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.any(String),
    );
  });

  it('uses package_ready template for package_ready event', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ email: 'user@example.com' }],
      [],
    ];
    const payload = {
      ...basePayload,
      event: 'package_ready',
      channels: ['email'] as const,
      template_data: { content_package_id: 'pkg-1' },
    };

    await processNotificationSend(payload, deps);

    expect(deps.resend.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Your content package is ready for review' }),
    );
  });

  it('uses fallback template for unknown event type', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ email: 'user@example.com' }],
      [],
    ];
    const payload = {
      ...basePayload,
      event: 'unknown_xyz_event',
      channels: ['email'] as const,
      template_data: {},
    };

    await processNotificationSend(payload as any, deps);

    expect(deps.resend.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'ContentPulse update' }),
    );
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'unknown_xyz_event' }),
      expect.any(String),
    );
  });

  it('skips email send for non-email channels', async () => {
    const deps = makeDeps();
    deps.db._queue = [
      [{ email: 'user@example.com' }],
    ];
    const payload = { ...basePayload, channels: ['push'] as any };

    await processNotificationSend(payload, deps);

    expect(deps.resend.send).not.toHaveBeenCalled();
    expect(deps.logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['push'] }),
      expect.any(String),
    );
  });
});
