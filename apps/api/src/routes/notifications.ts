import type { FastifyInstance } from 'fastify';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { Db } from '@contentpulse/db';
import { notifications, users } from '@contentpulse/db';
import type { PushSubscribeBody } from '@contentpulse/types';
import { notFound } from '../lib/errors';

export async function notificationRoutes(fastify: FastifyInstance & { db: Db }) {
  fastify.get(
    '/notifications',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const query = request.query as { unread_only?: string; limit?: string };
      const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));

      const conditions = [eq(notifications.userId, request.user.id)];
      if (query.unread_only === 'true') {
        conditions.push(isNull(notifications.readAt));
      }

      const notifList = await fastify.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(notifications.createdAt)
        .limit(limit);

      const unreadCountRows = await fastify.db
        .select({ unreadCount: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, request.user.id), isNull(notifications.readAt)));
      const unreadCount = unreadCountRows[0]?.unreadCount ?? 0;

      return reply.send({
        data: notifList.map((n) => ({
          id: n.id,
          user_id: n.userId,
          event: n.event,
          channel: n.channel,
          title: n.title,
          body: n.body,
          payload: n.payload,
          sent_at: n.sentAt?.toISOString() ?? null,
          read_at: n.readAt?.toISOString() ?? null,
          failed_at: n.failedAt?.toISOString() ?? null,
          created_at: n.createdAt.toISOString(),
        })),
        unread_count: unreadCount,
      });
    },
  );

  fastify.post<{ Body: PushSubscribeBody }>(
    '/notifications/push-subscribe',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      await fastify.db
        .update(users)
        .set({ pushSubscription: request.body.subscription, updatedAt: new Date() })
        .where(eq(users.id, request.user.id));

      return reply.status(200).send({ subscribed: true });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/notifications/:id/read',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [notif] = await fastify.db
        .select({ id: notifications.id, userId: notifications.userId })
        .from(notifications)
        .where(and(eq(notifications.id, request.params.id), eq(notifications.userId, request.user.id)))
        .limit(1);

      if (!notif) throw notFound('Notification', request.params.id);

      const now = new Date();
      await fastify.db
        .update(notifications)
        .set({ readAt: now, updatedAt: now })
        .where(eq(notifications.id, notif.id));

      return reply.send({ notification_id: notif.id, read_at: now.toISOString() });
    },
  );
}
