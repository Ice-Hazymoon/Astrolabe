import { Suspense, lazy } from 'react';
import { useSky } from '@/state/store';
import { UploadZone } from './UploadZone';

const PreviewView = lazy(() => import('./PreviewView').then((m) => ({ default: m.PreviewView })));
const ProcessingView = lazy(() =>
  import('./ProcessingView').then((m) => ({ default: m.ProcessingView }))
);
const ResultView = lazy(() => import('./ResultView').then((m) => ({ default: m.ResultView })));
const ErrorView = lazy(() => import('./ErrorView').then((m) => ({ default: m.ErrorView })));

function StageFallback() {
  return <div className="absolute inset-0 bg-[color:var(--color-ink-1)]/35" aria-hidden />;
}

export function Stage() {
  const phase = useSky((s) => s.phase);

  return (
    <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="absolute inset-0">
        {phase === 'idle' && <UploadZone />}
        {phase === 'preview' && (
          <Suspense fallback={<StageFallback />}>
            <PreviewView />
          </Suspense>
        )}
        {phase === 'processing' && (
          <Suspense fallback={<StageFallback />}>
            <ProcessingView />
          </Suspense>
        )}
        {phase === 'result' && (
          <Suspense fallback={<StageFallback />}>
            <ResultView />
          </Suspense>
        )}
        {phase === 'error' && (
          <Suspense fallback={<StageFallback />}>
            <ErrorView />
          </Suspense>
        )}
      </div>
    </main>
  );
}
