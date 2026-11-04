import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser calls the API directly (cookies are httpOnly). This value is public, not a secret.
  env: { NEXT_PUBLIC_API_URL: process.env.API_URL, NEXT_PUBLIC_APP_URL: process.env.APP_URL },
};
export default withNextIntl(nextConfig);
