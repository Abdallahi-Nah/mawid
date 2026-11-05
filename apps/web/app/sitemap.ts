import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/routing';
import { env } from '@/lib/env';
import { alternates, pageUrl } from '@/lib/seo';

/** Home, sign-in pages and the public page of every active business, in the 3 languages with hreflang. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap =>
    locales.map((locale) => ({
      url: pageUrl(locale, path),
      lastModified,
      alternates: { languages: alternates(locale, path).languages as Record<string, string> },
    }));

  let businesses: { slug: string; updatedAt: string }[] = [];
  try {
    const res = await fetch(`${env.API_URL}/public/sitemap`, { next: { revalidate: 3600 } });
    if (res.ok) businesses = (await res.json()) as typeof businesses;
  } catch {
    /* the API is down: the sitemap still lists the fixed pages */
  }
  return [
    ...entry('/'),
    ...entry('/login'),
    ...entry('/register'),
    ...businesses.flatMap((b) => entry(`/b/${b.slug}`, new Date(b.updatedAt))),
  ];
}
