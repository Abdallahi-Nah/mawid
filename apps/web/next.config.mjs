import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Font files never change (new weight = new file name): browsers can keep them for a year.
    return [
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
