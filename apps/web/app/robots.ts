import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/routing';
import { env } from '@/lib/env';

// Private areas and secret links must not be indexed.
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ['dashboard', 'admin', 'booking', 'review', 'onboarding', 'design'].flatMap(
    (p) => locales.map((l) => `/${l}/${p}`),
  );
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: privatePaths }],
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
