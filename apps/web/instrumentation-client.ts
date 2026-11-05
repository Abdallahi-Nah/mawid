import { scrubEvent } from '@/lib/sentry-scrub';

// Browser error tracking. The Sentry code is downloaded only when a DSN is configured, so a site without
// Sentry pays nothing for it (the public page must stay light on a mobile network).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      beforeSend: scrubEvent,
    }),
  );
}
