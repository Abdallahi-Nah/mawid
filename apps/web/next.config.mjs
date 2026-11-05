import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const isProd = process.env.NODE_ENV === 'production';
const apiOrigin = process.env.API_URL ? new URL(process.env.API_URL).origin : '';

// Content-Security-Policy of the web app. Next.js and the theme switch need small inline scripts, so
// 'unsafe-inline' stays for scripts and styles (a nonce would force every page to render on demand).
// Everything else is closed: only our own origin and the API can be reached, nothing can frame the site.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${process.env.SENTRY_INGEST_ORIGIN ?? ''}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    // Font files never change (new weight = new file name): browsers can keep them for a year.
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/fonts/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  // The browser calls the API directly (cookies are httpOnly). This value is public, not a secret.
  env: { NEXT_PUBLIC_API_URL: process.env.API_URL, NEXT_PUBLIC_APP_URL: process.env.APP_URL },
};
export default withNextIntl(nextConfig);
