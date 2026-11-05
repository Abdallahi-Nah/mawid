/** Sends an error caught by an error page to Sentry, only when a DSN is configured. */
export function reportError(error: unknown): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
}
