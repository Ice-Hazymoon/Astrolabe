import { AnimatePresence } from 'framer-motion';
import { useSky } from '@/state/store';
import { UploadZone } from './UploadZone';
import { PreviewView } from './PreviewView';
import { ProcessingView } from './ProcessingView';
import { ResultView } from './ResultView';
import { ErrorView } from './ErrorView';

export function Stage() {
  const phase = useSky((s) => s.phase);

  return (
    <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="absolute inset-0">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'idle' && <UploadZone key="idle" />}
          {phase === 'preview' && <PreviewView key="preview" />}
          {phase === 'processing' && <ProcessingView key="processing" />}
          {phase === 'result' && <ResultView key="result" />}
          {phase === 'error' && <ErrorView key="error" />}
        </AnimatePresence>
      </div>
    </main>
  );
}
