import type { ErrorEvent } from '@sentry/nextjs';

const SECRET_KEYS = /authorization|cookie|set-cookie|password|token|secret|api[-_]?key/i;

/** Removes cookies, form data, query strings and personal data from an event before it leaves the app. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.query_string) event.request.query_string = '[redacted]';
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).map(([k, v]) => [
          k,
          SECRET_KEYS.test(k) ? '[redacted]' : v,
        ]),
      );
    }
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}
