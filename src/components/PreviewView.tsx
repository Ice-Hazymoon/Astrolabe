import { motion } from 'framer-motion';
import { Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';
import { ImageViewer } from './ImageViewer';

export function PreviewView() {
  const { t } = useTranslation(['preview', 'upload']);
  const current = useSky((s) => s.current);
  const startAnalysis = useSky((s) => s.startAnalysis);
  const reset = useSky((s) => s.reset);

  if (!current) return null;

  return (
    <motion.div
      key="preview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full w-full p-2.5"
    >
      <ImageViewer
        src={current.inputDisplayUrl}
        alt={current.fileName ?? t('upload:altFallback')}
        cacheKey={`preview-${current.inputDisplayUrl.slice(-32)}`}
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 pb-5 px-4 z-30"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 surface rounded-full px-2 py-2 shadow-[var(--shadow-lift)]"
        >
          <Button
            variant="primary"
            size="md"
            leading={<Sparkles className="h-4 w-4" strokeWidth={2.2} />}
            onClick={() => void startAnalysis()}
          >
            {t('preview:buttons.solve')}
          </Button>
          <Button
            variant="ghost"
            size="md"
            leading={<Trash2 className="h-4 w-4" strokeWidth={2.2} />}
            onClick={reset}
          >
            {t('preview:buttons.swap')}
          </Button>
        </motion.div>
        {current.fileName && (
          <span className="pointer-events-none text-[11px] text-[color:var(--color-text-muted)] tracking-wide truncate max-w-[300px]">
            {current.fileName}
          </span>
        )}
      </div>
    </motion.div>
  );
}
