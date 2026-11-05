import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { fetchPublicBusiness } from '@/lib/public';

export const alt = 'Mawid';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const font = (file: string) => readFile(join(process.cwd(), 'assets', 'fonts', file));

/** Preview card shown when the page link is shared (WhatsApp, Facebook...). */
export default async function Image({ params }: { params: { locale: string; slug: string } }) {
  const b = await fetchPublicBusiness(params.slug).catch(() => null);
  const name = b?.name ?? 'Mawid';
  const color = b?.brandColor && /^#[0-9a-fA-F]{6}$/.test(b.brandColor) ? b.brandColor : '#0f766e';
  const arabic = /[؀-ۿ]/.test(name) || params.locale === 'ar';
  const [latin, plex] = await Promise.all([font('inter-700.ttf'), font('plex-arabic-700.ttf')]);
  const rating =
    b && b.ratingAverage !== null && b.reviewCount > 0
      ? `★ ${b.ratingAverage} (${b.reviewCount})`
      : null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        color: 'white',
        background: `linear-gradient(135deg, ${color}, #0b1f1d)`,
        fontFamily: arabic ? 'Plex' : 'Inter',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.9 }}>
        {params.locale === 'ar' ? 'موعد' : 'Mawid'}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          direction: arabic ? 'rtl' : 'ltr',
        }}
      >
        <div style={{ display: 'flex', fontSize: name.length > 28 ? 64 : 88, lineHeight: 1.15 }}>
          {name}
        </div>
        {b?.address ? (
          <div style={{ display: 'flex', fontSize: 36, opacity: 0.85 }}>{b.address}</div>
        ) : null}
        {rating ? <div style={{ display: 'flex', fontSize: 40 }}>{rating}</div> : null}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: latin, weight: 700, style: 'normal' },
        { name: 'Plex', data: plex, weight: 700, style: 'normal' },
      ],
    },
  );
}
