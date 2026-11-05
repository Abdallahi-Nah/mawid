import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

// Server side error tracking. Without SENTRY_DSN nothing is started and nothing is sent.
export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

// Errors thrown while rendering a page or running a server function.
export const onRequestError = Sentry.captureRequestError;
