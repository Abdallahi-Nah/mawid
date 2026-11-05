import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

type Req = IncomingMessage & { id?: string; user?: { id: string; businessId: string | null } };

/**
 * Structured logs (one JSON line per request in production, readable in development).
 * - every request has an id (the caller's `x-request-id` or a new one), sent back in the answer header;
 * - the line shows the path only (no query string: it can contain names or emails), never cookies or tokens;
 * - 5xx are logged as errors, 4xx as warnings, health checks are not logged;
 * - the user and business ids are added so a problem can be followed without personal data.
 */
export function loggerParams(env: NodeJS.ProcessEnv = process.env): Params {
  const level =
    env.LOG_LEVEL ??
    (env.NODE_ENV === 'production' ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'debug');
  return {
    pinoHttp: {
      level,
      transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const given = req.headers['x-request-id'];
        const id = typeof given === 'string' && /^[\w-]{8,64}$/.test(given) ? given : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => (req as Req).url?.startsWith('/health') ?? false },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      customProps: (req) => {
        const u = (req as Req).user;
        return u ? { userId: u.id, businessId: u.businessId } : {};
      },
      serializers: {
        req: (req: { id: string; method: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  };
}
