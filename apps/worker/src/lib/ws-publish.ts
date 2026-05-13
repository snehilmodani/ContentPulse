import type { Redis } from 'ioredis';
import type { WSEnvelope } from '@contentpulse/types';

export async function publishToUser(
  publisher: Redis,
  userId: string,
  envelope: WSEnvelope,
): Promise<void> {
  await publisher.publish(`ws:user:${userId}`, JSON.stringify(envelope));
}
