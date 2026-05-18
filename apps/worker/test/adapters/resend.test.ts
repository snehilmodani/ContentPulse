import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('p-retry', () => ({
  default: async (fn: () => Promise<unknown>) => fn(),
  AbortError: class AbortError extends Error {},
}));

import { ResendClient } from '../../src/adapters/resend';

describe('ResendClient — stub mode (no API key)', () => {
  it('writes to stdout and returns without calling fetch', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const client = new ResendClient('');
    await client.send({ to: 'test@example.com', subject: 'Hello', html: '<p>Hi</p>' });

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('test@example.com'));
    expect(fetchSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('ResendClient — real mode (with API key)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to Resend API with correct Authorization and from field', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true });

    const client = new ResendClient('re_test_key');
    await client.send({ to: 'user@example.com', subject: 'Test', html: '<h1>Test</h1>' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test_key');

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.from).toContain('contentpulse.app');
    expect(body.to).toBe('user@example.com');
    expect(body.subject).toBe('Test');
    expect(body.html).toBe('<h1>Test</h1>');
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 400 });

    const client = new ResendClient('re_test_key');
    await expect(
      client.send({ to: 'user@example.com', subject: 'Test', html: '<p>x</p>' })
    ).rejects.toThrow('400');
  });
});
