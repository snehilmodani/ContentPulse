import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import type { Db } from '@contentpulse/db';
import { refreshTokens, users } from '@contentpulse/db';
import type { AuthResponse, LoginBody, MeResponse, RefreshBody, RegisterBody } from '@contentpulse/types';
import { eq } from 'drizzle-orm';
import { badRequest, notFound } from '../lib/errors';

const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_TTL_DAYS = 30;

function toMeResponse(user: typeof users.$inferSelect): MeResponse {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    timezone: user.timezone,
    onboarding_complete: user.onboardingComplete,
    email_notifications: user.emailNotifications,
    push_notifications: user.pushNotifications,
    created_at: user.createdAt.toISOString(),
  };
}

export async function authRoutes(fastify: FastifyInstance & { db: Db }) {
  fastify.post<{ Body: RegisterBody }>('/auth/register', async (request, reply) => {
    const { email, password, display_name } = request.body;

    const existing = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw badRequest('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await fastify.db
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash, ...(display_name !== undefined ? { displayName: display_name } : {}) })
      .returning();

    if (!user) throw new Error('User creation failed');

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = await issueRefreshToken(fastify, user.id);

    const response: AuthResponse = {
      user: toMeResponse(user),
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    };

    return reply.status(201).send(response);
  });

  fastify.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) throw badRequest('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw badRequest('Invalid credentials');

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = await issueRefreshToken(fastify, user.id);

    const response: AuthResponse = {
      user: toMeResponse(user),
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    };

    return reply.send(response);
  });

  fastify.get(
    '/auth/me',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const [user] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1);

      if (!user) throw notFound('User', request.user.id);

      return reply.send(toMeResponse(user));
    },
  );

  fastify.post<{ Body: RefreshBody }>('/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body;

    const [token] = await fastify.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, refresh_token))
      .limit(1);

    if (!token || token.revoked || token.expiresAt < new Date()) {
      return reply.status(401).send({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Token is invalid or expired' } });
    }

    // rotate: revoke old, issue new in same family
    await fastify.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.family, token.family));

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);

    if (!user) return reply.status(401).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: ACCESS_TOKEN_TTL });
    const newRefreshToken = await issueRefreshToken(fastify, user.id, token.family);

    return reply.send({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
  });

  fastify.post('/auth/logout', { preHandler: fastify.authenticate }, async (request, reply) => {
    await fastify.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.userId, request.user.id));

    return reply.status(204).send();
  });
}

async function issueRefreshToken(
  fastify: FastifyInstance & { db: Db },
  userId: string,
  family?: string,
): Promise<string> {
  const token = uuidv4();
  const tokenFamily = family ?? uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600_000);

  await fastify.db.insert(refreshTokens).values({ userId, token, family: tokenFamily, expiresAt });

  return token;
}
