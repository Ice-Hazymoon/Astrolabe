import { Suspense, lazy, useState } from 'react';
import { Topbar } from './components/Topbar';
import { Stage } from './components/Stage';
import { ParameterSidebar } from './components/ParameterSidebar';
import { useSEO } from './i18n/useSEO';
import { useLocaleSync } from './i18n/useLocaleSync';

const ParameterDrawer = lazy(() =>
  import('./components/ParameterDrawer').then((m) => ({ default: m.ParameterDrawer }))
);
const HistoryStrip = lazy(() =>
  import('./components/HistoryStrip').then((m) => ({ default: m.HistoryStrip }))
);

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
      {historyOpen && (
        <div className="shrink-0 overflow-hidden">
          <Suspense fallback={null}>
            <HistoryStrip onClose={() => setHistoryOpen(false)} />
          </Suspense>
        </div>
      )}
      {drawerOpen && (
        <Suspense fallback={null}>
          <ParameterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
