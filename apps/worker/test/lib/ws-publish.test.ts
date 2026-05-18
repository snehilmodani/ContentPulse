import { describe, expect, it, vi } from 'vitest';
import { publishToUser } from '../../src/lib/ws-publish';

function makeRedis() {
  return { publish: vi.fn().mockResolvedValue(1) } as any;
}

describe('publishToUser', () => {
  it('publishes to the correct channel for the user', async () => {
    const redis = makeRedis();
    await publishToUser(redis, 'user-abc', {
      event: 'ideas_ready',
      data: { trend_run_id: 'run-1', idea_count: 5 },
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(redis.publish).toHaveBeenCalledOnce();
    expect(redis.publish).toHaveBeenCalledWith(
      'ws:user:user-abc',
      expect.any(String),
    );
  });

  it('serialises the envelope as valid JSON', async () => {
    const redis = makeRedis();
    const envelope = {
      event: 'pipeline_stage_started' as const,
      data: { trend_run_id: 'run-2', stage: 'idea-generation' },
      timestamp: '2024-01-01T00:00:00Z',
    };

    await publishToUser(redis, 'user-xyz', envelope);

    const [, payload] = redis.publish.mock.calls[0] as [string, string];
    expect(() => JSON.parse(payload)).not.toThrow();
    expect(JSON.parse(payload)).toMatchObject({ event: 'pipeline_stage_started' });
  });

  it('uses different channels for different user IDs', async () => {
    const redis = makeRedis();

    await publishToUser(redis, 'user-1', { event: 'ideas_ready', data: { trend_run_id: 'r', idea_count: 1 }, timestamp: '' });
    await publishToUser(redis, 'user-2', { event: 'ideas_ready', data: { trend_run_id: 'r', idea_count: 1 }, timestamp: '' });

    const channels = redis.publish.mock.calls.map(([ch]: [string]) => ch);
    expect(channels[0]).toBe('ws:user:user-1');
    expect(channels[1]).toBe('ws:user:user-2');
  });
});
