import { ImageResponse } from 'next/og';
import { getLocaleSeo } from '@/i18n/server';
import { isSupportedUiLanguage } from '@/i18n/languages';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const seo = await getLocaleSeo(isSupportedUiLanguage(lang) ? lang : 'en');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          background:
            'radial-gradient(circle at top left, rgba(120, 194, 255, 0.28), transparent 34%), linear-gradient(160deg, #0b0e16 0%, #11162a 52%, #1a1330 100%)',
          color: '#f2f5ff',
          fontFamily: 'system-ui',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#97a7d8',
          }}
        >
          Stellaris
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 920 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.08 }}>
            {seo.shortTitle}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              lineHeight: 1.35,
              color: '#d8ddf0',
            }}
          >
            {seo.description}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 24, color: '#f6c66f' }}>
          <span>Constellations</span>
          <span>Stars</span>
          <span>Deep-Sky Objects</span>
        </div>
      </div>
    ),
    size,
  );
}
