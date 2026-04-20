import { useCallback, useEffect, useState } from 'react';

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
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [isInstalled, setIsInstalled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReady(true);
    setPlatform(detectInstallPlatform());

    const syncInstalled = () => setIsInstalled(isStandaloneMode());
    const displayQueries = [
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(display-mode: minimal-ui)'),
      window.matchMedia('(display-mode: fullscreen)'),
    ];

    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
      setDialogOpen(false);
    };

    syncInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    for (const query of displayQueries) {
      query.addEventListener('change', syncInstalled);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      for (const query of displayQueries) {
        query.removeEventListener('change', syncInstalled);
      }
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
