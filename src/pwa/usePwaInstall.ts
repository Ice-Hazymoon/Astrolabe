import { useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import type { BeforeInstallPromptEvent } from '@/types/pwa';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  const isiOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isiOS) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true
  );
}

export function usePwaInstall() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const platform = useSyncExternalStore<InstallPlatform>(
    () => () => {},
    detectInstallPlatform,
    () => 'desktop',
  );
  const isInstalled = useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') {
        return () => {};
      }

      const displayQueries = [
        window.matchMedia('(display-mode: standalone)'),
        window.matchMedia('(display-mode: minimal-ui)'),
        window.matchMedia('(display-mode: fullscreen)'),
      ];

      window.addEventListener('appinstalled', onChange);
      for (const query of displayQueries) {
        query.addEventListener('change', onChange);
      }

      return () => {
        window.removeEventListener('appinstalled', onChange);
        for (const query of displayQueries) {
          query.removeEventListener('change', onChange);
        }
      };
    },
    isStandaloneMode,
    () => false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (event: Event) => {
      const installPromptEvent = event as BeforeInstallPromptEvent;
      event.preventDefault();
      setInstallEvent(installPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallEvent(null);
      setDialogOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const requestInstall = useCallback(async () => {
    if (isInstalled) return 'installed';
    if (!installEvent) {
      setDialogOpen(true);
      return 'manual';
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        setDialogOpen(false);
        return 'accepted';
      }
    } catch (error) {
      console.warn('[PWA] install prompt failed', error);
      setInstallEvent(null);
    }

    setDialogOpen(true);
    return 'dismissed';
  }, [installEvent, isInstalled]);

  return {
    ready,
    platform,
    dialogOpen,
    isInstalled,
    installPromptAvailable: !!installEvent,
    showInstallEntry: ready && !isInstalled,
    openDialog,
    closeDialog,
    requestInstall,
  };
}
