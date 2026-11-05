import type { PublicBusiness, PublicReviewsPage } from '@mawid/shared';
import { env } from '@/lib/env';

/** Server-side read of the public page data. null = no such business. Throws when the API is down. */
export async function fetchPublicBusiness(slug: string): Promise<PublicBusiness | null> {
  const res = await fetch(`${env.API_URL}/public/businesses/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (res.status === 404 || res.status === 403) return null; // 403 = suspended by an admin
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as PublicBusiness;
}

/** First reviews of the public page. A failure only hides the section: the page still works. */
export async function fetchPublicReviews(slug: string): Promise<PublicReviewsPage | null> {
  try {
    const res = await fetch(
      `${env.API_URL}/public/businesses/${encodeURIComponent(slug)}/reviews?pageSize=6`,
      { cache: 'no-store' },
    );
    return res.ok ? ((await res.json()) as PublicReviewsPage) : null;
  } catch {
    return null;
  }
}

/** Opening hours of today ("09:00 – 18:00") from the employees' schedules, in the business time zone. */
export function todayHours(b: PublicBusiness, now = new Date()): string | null {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: b.timezone }).format(
    now,
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
  const ranges = b.staff.flatMap((s) => s.workingHours.filter((w) => w.weekday === weekday));
  if (ranges.length === 0) return null;
  const start = ranges.map((r) => r.startTime).sort()[0];
  const end = ranges
    .map((r) => r.endTime)
    .sort()
    .at(-1);
  return `${start} – ${end}`;
}
