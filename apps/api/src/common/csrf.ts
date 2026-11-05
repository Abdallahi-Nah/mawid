import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth/cookies';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const originOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * CSRF defence in depth. The session cookies are already SameSite=Lax (a cross-site POST does not carry them);
 * this also refuses a state-changing request that carries a session cookie when the browser says it comes from
 * another site: the Origin (or Referer) must be one of our own origins. Requests without a session cookie
 * (guests, login) and safe methods are not concerned. Programs (curl, tests) send no Origin and are allowed.
 */
export function csrfGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((u) => originOf(u)).filter(Boolean));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!UNSAFE.has(req.method)) return next();
    const cookies = req.cookies as Record<string, string> | undefined;
    if (!cookies?.[ACCESS_COOKIE] && !cookies?.[REFRESH_COOKIE]) return next();
    const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    const crossSite = req.headers['sec-fetch-site'] === 'cross-site';
    if (origin ? !allowed.has(origin) : crossSite) {
      res.status(403).json({ code: 'CSRF_BLOCKED', message: 'Request refused: wrong origin' });
      return;
    }
    next();
  };
}
