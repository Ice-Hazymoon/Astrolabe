import dynamic from 'next/dynamic';
import { useSky } from '@/state/store';
import { UploadZone } from './UploadZone';

function StageFallback() {
  return <div className="absolute inset-0 bg-[color:var(--color-ink-1)]/35" aria-hidden />;
}

const PreviewView = dynamic(
  () => import('./PreviewView').then((m) => m.PreviewView),
  { loading: () => <StageFallback /> },
);
const ProcessingView = dynamic(
  () => import('./ProcessingView').then((m) => m.ProcessingView),
  { loading: () => <StageFallback /> },
);
const ResultView = dynamic(
  () => import('./ResultView').then((m) => m.ResultView),
  { loading: () => <StageFallback /> },
);
const ErrorView = dynamic(
  () => import('./ErrorView').then((m) => m.ErrorView),
  { loading: () => <StageFallback /> },
);

export function Stage() {
  const phase = useSky((s) => s.phase);

  return (
    <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="absolute inset-0">
        {phase === 'idle' && <UploadZone />}
        {phase === 'preview' && <PreviewView />}
        {phase === 'processing' && <ProcessingView />}
        {phase === 'result' && <ResultView />}
        {phase === 'error' && <ErrorView />}
      </div>
    </main>
  );
}
