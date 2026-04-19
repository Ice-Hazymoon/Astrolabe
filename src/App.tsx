import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from './components/Topbar';
import { Stage } from './components/Stage';
import { ParameterSidebar } from './components/ParameterSidebar';
import { ParameterDrawer } from './components/ParameterDrawer';
import { HistoryStrip } from './components/HistoryStrip';
import { useSEO } from './i18n/useSEO';
import { useLocaleSync } from './i18n/useLocaleSync';

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useSEO();
  useLocaleSync();

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
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        historyOpen={historyOpen}
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
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 overflow-hidden"
          >
            <HistoryStrip onClose={() => setHistoryOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <ParameterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
