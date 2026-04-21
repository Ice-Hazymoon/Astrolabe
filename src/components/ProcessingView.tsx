import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import type { PhaseId } from '@/state/store';
import { Button } from './ui/Button';

const PHASE_SEQUENCE: PhaseId[] = ['upload', 'extract', 'solve', 'match', 'finalize'];

export function ProcessingView() {
  const { t } = useTranslation(['processing', 'common']);
  const current = useSky((s) => s.current);
  const progress = useSky((s) => s.progress);
  const cancel = useSky((s) => s.cancel);

  if (!current) return null;
  const activeIndex = PHASE_SEQUENCE.indexOf(progress.phaseId);

  const phaseLabel = PHASE_SEQUENCE.includes(progress.phaseId)
    ? t(`processing:phases.${progress.phaseId}`)
    : t('common:status.preparing');

  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full w-full p-2.5"
    >
      <div className="relative h-full w-full rounded-[var(--radius-lg)] overflow-hidden border border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-1)]/60 shadow-[var(--shadow-lift)]">
        <img
          src={current.inputDisplayUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover blur-xl scale-110 opacity-80"
        />
        <div className="absolute inset-0 bg-[color:var(--color-ink-0)]/30" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-[color:var(--color-star)]/15 to-transparent"
            animate={{ x: ['0%', '500%'] }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="relative inline-flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-[color:var(--color-star)]/40 animate-[pulse-soft_1.8s_ease-in-out_infinite]" />
            <span className="absolute inset-2 rounded-full border border-[color:var(--color-star)]/30 animate-[pulse-soft_1.8s_ease-in-out_0.4s_infinite]" />
            <span className="absolute inset-5 rounded-full bg-[color:var(--color-star)] blur-[1px] shadow-[0_0_24px_oklch(0.86_0.13_78/0.7)]" />
          </span>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2.5">
          <div className="surface rounded-[var(--radius-md)] w-full max-w-[480px] px-4 py-3 flex flex-col gap-2 shadow-[var(--shadow-lift)]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-[color:var(--color-text)]">{phaseLabel}</span>
              <span className="text-mono text-[11px] text-[color:var(--color-text-muted)] tabular-nums">
                {Math.round(progress.pct * 100)}%
              </span>
            </div>
            <div className="relative h-[3px] w-full rounded-full overflow-hidden bg-[color:var(--color-ink-3)]/70">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--color-star)]"
                animate={{ width: `${Math.max(2, progress.pct * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <ul className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[10px] text-[color:var(--color-text-muted)] tracking-[0.04em]">
              {PHASE_SEQUENCE.map((phaseId, index) => (
                <li
                  key={phaseId}
                  className={
                    index < activeIndex
                      ? 'text-[color:var(--color-text-soft)]'
                      : index === activeIndex
                        ? 'text-[color:var(--color-star)]'
                        : ''
                  }
                >
                  {t(`processing:phases.${phaseId}`)}
                </li>
              ))}
            </ul>
          </div>
          <Button
            variant="ghost"
            size="sm"
            leading={<X className="h-3.5 w-3.5" strokeWidth={2.4} />}
            onClick={cancel}
          >
            {t('processing:cancel')}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
