import { describe, expect, it, vi } from 'vitest';
import { incrStagesDone } from '../../src/lib/redis-coord';

function makePipeline(incrResult: number) {
  const pipeline = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, incrResult], [null, 1]]),
  };
  return pipeline;
}

function makeRedis(incrResult: number) {
  const pipeline = makePipeline(incrResult);
  const redis = {
    pipeline: vi.fn().mockReturnValue(pipeline),
    _pipeline: pipeline,
  } as any;
  return redis;
}

describe('incrStagesDone', () => {
  it('uses a Redis pipeline with INCR and EXPIRE', async () => {
    const redis = makeRedis(1);
    await incrStagesDone(redis, 'pkg-123');
    expect(redis._pipeline.incr).toHaveBeenCalledWith('pkg:pkg-123:stages_done');
    expect(redis._pipeline.expire).toHaveBeenCalledWith('pkg:pkg-123:stages_done', 86400);
  });

  it('returns the incremented count from the pipeline result', async () => {
    const redis = makeRedis(3);
    const count = await incrStagesDone(redis, 'pkg-abc');
    expect(count).toBe(3);
  });

  it('returns 0 when pipeline exec returns null results', async () => {
    const pipeline = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    };
    const redis = { pipeline: vi.fn().mockReturnValue(pipeline) } as any;
    const count = await incrStagesDone(redis, 'pkg-null');
    expect(count).toBe(0);
  });

  it('uses the correct key format pkg:<packageId>:stages_done', async () => {
    const redis = makeRedis(1);
    await incrStagesDone(redis, 'my-package-id');
    expect(redis._pipeline.incr).toHaveBeenCalledWith('pkg:my-package-id:stages_done');
  });

  it('sets TTL of 86400 seconds (24h) on the key', async () => {
    const redis = makeRedis(1);
    await incrStagesDone(redis, 'pkg-ttl');
    expect(redis._pipeline.expire).toHaveBeenCalledWith(expect.any(String), 86400);
  });
});
