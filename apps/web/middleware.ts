import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // "backend" is the path under which the API can be relayed (see next.config.mjs): it must not get a language prefix.
  matcher: ['/((?!api|backend|_next|_vercel|.*\\..*).*)'],
};
