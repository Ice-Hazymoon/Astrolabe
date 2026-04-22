import { motion } from 'framer-motion';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';

const PLATE_SOLVE_REASON_KEYS = [
  'panorama',
  'composite',
  'fisheye',
  'heavyEditing',
  'notNightSky',
  'tooFewStars',
  'motionBlur',
] as const;

export function ErrorView() {
  const { t } = useTranslation('error');
  const error = useSky((s) => s.error);
  const reset = useSky((s) => s.reset);
  const startAnalysis = useSky((s) => s.startAnalysis);
  const current = useSky((s) => s.current);

  const isPlateSolveFailure = error === 'plate_solve_failed';
  const title = isPlateSolveFailure ? t('plateSolveFailed.title') : t('title');
  const message = isPlateSolveFailure
    ? t('plateSolveFailed.message')
    : error === 'generation_failed' ? t('fallbackMessage') : (error ?? t('fallbackMessage'));

  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full w-full flex flex-col items-center justify-center gap-4 px-6 py-6"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-danger)]/10 border border-[color:var(--color-danger)]/30">
        <AlertCircle className="h-5 w-5 text-[color:var(--color-danger)]" strokeWidth={2} />
      </span>
      <div className="text-center max-w-[480px]">
        <h2 className="text-display text-[20px] text-[color:var(--color-text)]">{title}</h2>
        <p className="mt-1.5 text-[13px] text-[color:var(--color-text-muted)]">
          {message}
        </p>
      </div>

      {isPlateSolveFailure && (
        <div className="w-full max-w-[480px] rounded-lg border border-[color:var(--color-border)]/60 bg-[color:var(--color-surface-muted)]/40 p-4">
          <p className="text-[12px] font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">
            {t('plateSolveFailed.reasonsHeading')}
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-[color:var(--color-text)]">
            {PLATE_SOLVE_REASON_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1 w-1 flex-none rounded-full bg-[color:var(--color-text-muted)]/70"
                  aria-hidden
                />
                <span>
                  <span className="font-medium">{t(`plateSolveFailed.reasons.${key}.title`)}</span>
                  <span className="text-[color:var(--color-text-muted)]">
                    {' — '}{t(`plateSolveFailed.reasons.${key}.detail`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-[color:var(--color-text-muted)]">
            {t('plateSolveFailed.suggestion')}
          </p>
        </div>
      )}

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
