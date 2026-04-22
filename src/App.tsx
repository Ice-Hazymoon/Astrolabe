import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Topbar } from './components/Topbar';
import { Stage } from './components/Stage';
import { ParameterSidebar } from './components/ParameterSidebar';
import { LanguageSettingsDialog } from './components/LanguageSettingsDialog';
import { PwaInstallDialog } from './components/PwaInstallDialog';
import { HistoryStrip } from './components/HistoryStrip';
import { useLocaleSync } from './i18n/useLocaleSync';
import { usePwaInstall } from './pwa/usePwaInstall';
import { history } from './lib/storage';
import { useSky } from './state/store';

const ParameterDrawer = dynamic(
  () => import('./components/ParameterDrawer').then((m) => m.ParameterDrawer),
  { loading: () => null },
);

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const pwa = usePwaInstall();
  useLocaleSync();

  useEffect(() => {
    const syncHistory = (entries: ReturnType<typeof history.list>) => {
      useSky.getState().hydrateHistory(entries);
    };

    // Keep the server render and the first client render identical, then
    // hydrate browser-only state like localStorage-backed history after mount.
    const unsubscribe = history.subscribe(syncHistory);
    syncHistory(history.list());
    void useSky.getState().refreshApi();

    return unsubscribe;
  }, []);

  return (
    <div
      className="relative z-10 flex flex-col h-[100dvh] overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <Topbar
        onOpenSettings={() => setDrawerOpen(true)}
        onOpenLanguageSettings={() => setLanguageDialogOpen(true)}
        onOpenPwaInstall={() => {
          if (pwa.installPromptAvailable) {
            void pwa.requestInstall();
            return;
          }
          pwa.openDialog();
        }}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        historyOpen={historyOpen}
        showPwaInstall={pwa.showInstallEntry}
        installPromptAvailable={pwa.installPromptAvailable}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <Stage />
        <ParameterSidebar />
      </div>
      <AnimatePresence initial={false}>
        {historyOpen && (
          <motion.div
            key="history-strip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 overflow-hidden"
          >
            <HistoryStrip onClose={() => setHistoryOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <ParameterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <LanguageSettingsDialog
        open={languageDialogOpen}
        onClose={() => setLanguageDialogOpen(false)}
      />
      <PwaInstallDialog
        open={pwa.dialogOpen}
        canPrompt={pwa.installPromptAvailable}
        platform={pwa.platform}
        onClose={pwa.closeDialog}
        onInstall={() => void pwa.requestInstall()}
      />
    </div>
  );
}
