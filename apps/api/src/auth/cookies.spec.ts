import type { Response } from 'express';
import { loadEnv } from '../config/env';
import { clearAuthCookies, setAuthCookies } from './cookies';

const fakeRes = () => {
  const calls: { name: string; opts: Record<string, unknown> }[] = [];
  const res = {
    cookie: (name: string, _v: string, opts: Record<string, unknown>) => calls.push({ name, opts }),
    clearCookie: (name: string, opts: Record<string, unknown>) => calls.push({ name, opts }),
  } as unknown as Response;
  return { res, calls };
};
const path = (calls: { name: string; opts: Record<string, unknown> }[], name: string) =>
  calls.find((c) => c.name === name)?.opts.path;

describe('auth cookies', () => {
  it('normally: access cookie on /, refresh cookie only on /auth (httpOnly, SameSite=Lax)', () => {
    const { res, calls } = fakeRes();
    setAuthCookies(res, 'a', 'r', true);
    expect(path(calls, 'mawid_at')).toBe('/');
    expect(path(calls, 'mawid_rt')).toBe('/auth');
    for (const c of calls)
      expect(c.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
  });

  it('behind the /backend relay: the refresh cookie path follows the prefix, the access cookie stays on /', () => {
    const { res, calls } = fakeRes();
    setAuthCookies(res, 'a', 'r', true, '/backend');
    expect(path(calls, 'mawid_at')).toBe('/');
    expect(path(calls, 'mawid_rt')).toBe('/backend/auth');
  });

  it('logout clears the refresh cookie on the same path it was set on', () => {
    const plain = fakeRes();
    clearAuthCookies(plain.res, false);
    expect(path(plain.calls, 'mawid_rt')).toBe('/auth');
    const relayed = fakeRes();
    clearAuthCookies(relayed.res, false, '/backend');
    expect(path(relayed.calls, 'mawid_rt')).toBe('/backend/auth');
  });
});

describe('COOKIE_PATH_PREFIX setting', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@h/db',
    REDIS_URL: 'redis://h',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    APP_URL: 'https://app.test',
    API_URL: 'https://api.test',
    MAIL_FROM: 'a@b.test',
  };
  it('is empty by default and accepts a simple path', () => {
    expect(loadEnv(base as NodeJS.ProcessEnv).COOKIE_PATH_PREFIX).toBe('');
    expect(
      loadEnv({ ...base, COOKIE_PATH_PREFIX: '/backend' } as NodeJS.ProcessEnv).COOKIE_PATH_PREFIX,
    ).toBe('/backend');
  });
  it('refuses a value that could break the cookie (no trailing slash, no spaces, no ;)', () => {
    for (const bad of ['backend', '/backend/', '/back end', '/a;b', '/x/../y']) {
      expect(() => loadEnv({ ...base, COOKIE_PATH_PREFIX: bad } as NodeJS.ProcessEnv)).toThrow();
    }
  });
});
