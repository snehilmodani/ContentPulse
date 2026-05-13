import type { FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(resource: string, id: string): AppError {
  return new AppError(`${resource.toUpperCase()}_NOT_FOUND`, `${resource} ${id} not found`, 404);
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError('FORBIDDEN', message, 403);
}

export function conflict(message: string): AppError {
  return new AppError('CONFLICT', message, 409);
}

export function badRequest(message: string): AppError {
  return new AppError('BAD_REQUEST', message, 400);
}

export function errorHandler(
  error: Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  void reply.status(statusCode).send({
    error: { code: 'INTERNAL_ERROR', message: error.message ?? 'Internal server error' },
  });
}
