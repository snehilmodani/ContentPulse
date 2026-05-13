import type { Redis } from 'ioredis';

const COORD_TTL_SECONDS = 86400;

export async function incrStagesDone(redis: Redis, packageId: string): Promise<number> {
  const key = `pkg:${packageId}:stages_done`;
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, COORD_TTL_SECONDS);
  const results = await pipeline.exec();
  const incrResult = results?.[0];
  return (incrResult?.[1] as number) ?? 0;
}
