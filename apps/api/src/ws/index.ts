import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from '@fastify/websocket';
import { getChannelForUser } from './publisher';

export async function registerWebSocket(fastify: FastifyInstance & { redis: Redis }) {
  fastify.get('/v1/ws', { websocket: true }, async (socket: WebSocket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Missing token');
      return;
    }

    let userId: string;
    try {
      const decoded = fastify.jwt.verify<{ sub: string }>(token);
      userId = decoded.sub;
    } catch {
      socket.close(4001, 'Invalid token');
      return;
    }

    const subscriber = fastify.redis.duplicate();
    const channel = getChannelForUser(userId);

    await subscriber.subscribe(channel);

    subscriber.on('message', (_chan: string, message: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    });

    socket.on('close', () => {
      void subscriber.unsubscribe(channel).then(() => subscriber.disconnect());
    });

    socket.on('error', () => {
      void subscriber.unsubscribe(channel).then(() => subscriber.disconnect());
    });
  });
}
