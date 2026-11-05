import * as Sentry from '@sentry/node';

/** Headers and body fields that must never leave the server. */
const SECRET_KEYS = /authorization|cookie|set-cookie|password|token|secret|api[-_]?key/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1),
    ]),
  );
}

/** Removes cookies, tokens, passwords and personal data from an event before it is sent. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data; // bodies contain names, phones, emails and passwords
    event.request.headers = scrub(event.request.headers) as Record<string, string>;
    if (event.request.query_string) event.request.query_string = '[redacted]';
  }
  if (event.user) event.user = { id: event.user.id };
  if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
  if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
  return event;
}

/** Starts Sentry only when a DSN is given. Without a DSN nothing is sent and nothing is loaded. */
export function initSentry(env: {
  SENTRY_DSN: string;
  NODE_ENV: string;
  SENTRY_RELEASE: string;
}): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
    // No lines of source code in the stack frames: they could contain a secret written in the code.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'ContextLines'),
    beforeSend: (event) => scrubEvent(event),
  });
  return true;
}

export const captureServerError = (e: unknown): void => {
  Sentry.captureException(e);
};
