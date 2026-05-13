import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp = require('fastify-plugin');

interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; email: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const decoded = await request.jwtVerify<JwtPayload>();
        request.user = { id: decoded.sub, email: decoded.email };
      } catch {
        void reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
      }
    },
  );
});
