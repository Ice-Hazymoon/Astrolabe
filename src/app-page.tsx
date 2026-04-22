'use client';

import { useEffect } from 'react';
import App from '@/App';

export function AppPage() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('[PWA] service worker registration failed', error);
    });
  }, []);

  return <App />;
}
