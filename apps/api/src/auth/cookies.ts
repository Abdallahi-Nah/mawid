import type { Response } from 'express';

export const ACCESS_COOKIE = 'mawid_at';
export const REFRESH_COOKIE = 'mawid_rt';
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

// httpOnly keeps tokens away from JavaScript (XSS). SameSite=Lax blocks cross-site POSTs (CSRF).
// The refresh cookie is only sent to /auth.
export function setAuthCookies(
  res: Response,
  access: string,
  refresh: string,
  secure: boolean,
): void {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const };
  res.cookie(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: ACCESS_TTL_SEC * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...base, path: '/auth', maxAge: REFRESH_TTL_SEC * 1000 });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const };
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/auth' });
}
