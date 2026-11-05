import type { NextFunction, Request, Response } from 'express';
import { csrfGuard } from './csrf';

const run = (req: Partial<Request>) => {
  const next = jest.fn() as unknown as NextFunction;
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
  csrfGuard(['https://app.mawid.test', 'https://api.mawid.test/'])(
    { headers: {}, cookies: {}, ...req } as Request,
    res,
    next,
  );
  return { allowed: (next as unknown as jest.Mock).mock.calls.length === 1, json };
};
const session = { mawid_at: 'token' };

describe('csrfGuard', () => {
  it('lets safe methods through', () => {
    expect(
      run({ method: 'GET', cookies: session, headers: { origin: 'https://evil.test' } }).allowed,
    ).toBe(true);
  });
  it('lets a request without session cookie through (guest, login)', () => {
    expect(run({ method: 'POST', headers: { origin: 'https://evil.test' } }).allowed).toBe(true);
  });
  it('refuses a POST with a session cookie from another origin', () => {
    const r = run({ method: 'POST', cookies: session, headers: { origin: 'https://evil.test' } });
    expect(r.allowed).toBe(false);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CSRF_BLOCKED' }));
  });
  it('accepts our own origins, and falls back to the Referer', () => {
    expect(
      run({ method: 'PATCH', cookies: session, headers: { origin: 'https://app.mawid.test' } })
        .allowed,
    ).toBe(true);
    expect(
      run({ method: 'DELETE', cookies: session, headers: { origin: 'https://api.mawid.test' } })
        .allowed,
    ).toBe(true);
    expect(
      run({ method: 'POST', cookies: session, headers: { referer: 'https://evil.test/page' } })
        .allowed,
    ).toBe(false);
    expect(
      run({
        method: 'POST',
        cookies: session,
        headers: { referer: 'https://app.mawid.test/fr/login' },
      }).allowed,
    ).toBe(true);
  });
  it('refuses a cross-site request that has no Origin, allows a program without headers', () => {
    expect(
      run({ method: 'POST', cookies: session, headers: { 'sec-fetch-site': 'cross-site' } })
        .allowed,
    ).toBe(false);
    expect(run({ method: 'POST', cookies: session }).allowed).toBe(true);
  });
  it('also guards the refresh cookie', () => {
    expect(
      run({ method: 'POST', cookies: { mawid_rt: 'x' }, headers: { origin: 'https://evil.test' } })
        .allowed,
    ).toBe(false);
  });
});
