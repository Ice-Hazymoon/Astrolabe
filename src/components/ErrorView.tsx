import { motion } from 'framer-motion';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';

export function ErrorView() {
  const { t } = useTranslation('error');
  const error = useSky((s) => s.error);
  const reset = useSky((s) => s.reset);
  const startAnalysis = useSky((s) => s.startAnalysis);
  const current = useSky((s) => s.current);

  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full w-full flex flex-col items-center justify-center gap-4 px-6"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-danger)]/10 border border-[color:var(--color-danger)]/30">
        <AlertCircle className="h-5 w-5 text-[color:var(--color-danger)]" strokeWidth={2} />
      </span>
      <div className="text-center max-w-[420px]">
        <h2 className="text-display text-[20px] text-[color:var(--color-text)]">{t('title')}</h2>
        <p className="mt-1.5 text-[13px] text-[color:var(--color-text-muted)]">
          {error ?? t('fallbackMessage')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {current && (
          <Button
            variant="primary"
            size="md"
            leading={<RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />}
            onClick={() => void startAnalysis()}
          >
            {t('buttons.retry')}
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={reset}>
          {t('buttons.reset')}
        </Button>
      </div>
    </motion.div>
  );
}
