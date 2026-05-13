import type { Redis } from 'ioredis';
import type { WSEnvelope } from '@contentpulse/types';

const WS_CHANNEL_PREFIX = 'ws:user:';

export function getChannelForUser(userId: string): string {
  return `${WS_CHANNEL_PREFIX}${userId}`;
}

export async function publishToUser(
  publisher: Redis,
  userId: string,
  envelope: WSEnvelope,
): Promise<void> {
  await publisher.publish(getChannelForUser(userId), JSON.stringify(envelope));
}
