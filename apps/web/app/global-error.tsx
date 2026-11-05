'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

// Last safety net: even the page layout failed, so there is no language provider here.
// The text is written in the three languages on purpose.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          padding: 24,
          textAlign: 'center',
          color: '#0f172a',
          background: '#f8fafc',
        }}
      >
        <main>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Une erreur est survenue</h1>
          <p style={{ margin: '4px 0' }}>Something went wrong</p>
          <p dir="rtl" style={{ margin: '4px 0 20px' }}>
            حدث خطأ ما
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 0,
              background: '#0f766e',
              color: 'white',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Réessayer · Retry · إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
