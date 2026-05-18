import { describe, expect, it, vi } from 'vitest';
import { AppError, badRequest, conflict, errorHandler, forbidden, notFound } from '../src/lib/errors';

describe('AppError', () => {
  it('sets all fields correctly', () => {
    const err = new AppError('MY_CODE', 'my message', 422);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('MY_CODE');
    expect(err.message).toBe('my message');
    expect(err.statusCode).toBe(422);
    expect(err instanceof Error).toBe(true);
  });

  it('defaults statusCode to 400', () => {
    const err = new AppError('CODE', 'msg');
    expect(err.statusCode).toBe(400);
  });

  it('is an instance of Error', () => {
    expect(new AppError('X', 'y') instanceof Error).toBe(true);
  });
});

describe('notFound', () => {
  it('builds a 404 with resource name uppercased in code', () => {
    const err = notFound('User', 'abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.message).toContain('abc-123');
  });

  it('uppercases multi-word resource names', () => {
    const err = notFound('TrendRun', 'xyz');
    expect(err.code).toBe('TRENDRUN_NOT_FOUND');
  });
});

describe('forbidden', () => {
  it('builds a 403 with default message', () => {
    const err = forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Access denied');
  });

  it('accepts a custom message', () => {
    const err = forbidden('You shall not pass');
    expect(err.message).toBe('You shall not pass');
  });
});

describe('conflict', () => {
  it('builds a 409', () => {
    const err = conflict('Already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Already exists');
  });
});

describe('badRequest', () => {
  it('builds a 400', () => {
    const err = badRequest('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Invalid input');
  });
});

describe('errorHandler', () => {
  function makeReply() {
    const reply: any = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    return reply;
  }
  const req: any = {};

  it('handles AppError with its own status and code', () => {
    const reply = makeReply();
    errorHandler(new AppError('TEST_CODE', 'test message', 422), req, reply);
    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'TEST_CODE', message: 'test message' },
    });
  });

  it('handles generic Error as 500 INTERNAL_ERROR', () => {
    const reply = makeReply();
    errorHandler(new Error('boom'), req, reply);
    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
  });

  it('respects statusCode on non-AppError with a statusCode property', () => {
    const reply = makeReply();
    const err = Object.assign(new Error('rate limited'), { statusCode: 429 });
    errorHandler(err, req, reply);
    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'rate limited' },
    });
  });

  it('badRequest AppError produces 400 response', () => {
    const reply = makeReply();
    errorHandler(badRequest('Bad param'), req, reply);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Bad param' },
    });
  });

  it('notFound AppError produces 404 response', () => {
    const reply = makeReply();
    errorHandler(notFound('Idea', 'idea-1'), req, reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });
});
