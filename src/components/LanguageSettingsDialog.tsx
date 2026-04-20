import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import { LabelLocaleSwitcher } from '@/i18n/LabelLocaleSwitcher';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

interface LanguageSettingsDialogProps {
  open: boolean;
  onClose(): void;
}

export function LanguageSettingsDialog({ open, onClose }: LanguageSettingsDialogProps) {
  const { t } = useTranslation(['common', 'parameters']);
  const current = useSky((s) => s.current);
  const phase = useSky((s) => s.phase);
  const locale = useSky((s) => s.locale);
  const resultLocale = useSky((s) => s.resultLocale);
  const startAnalysis = useSky((s) => s.startAnalysis);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const canReanalyze = phase === 'result' && !!current && current.blob.size > 0 && !!resultLocale;
  const localeDrifted = !!resultLocale && locale !== resultLocale;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    if (prev instanceof HTMLElement) restoreFocusRef.current = prev;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75]" aria-modal="true" role="dialog" aria-label={t('common:language.label')}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-[color:var(--color-ink-0)]/35 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            ref={(node) => {
              dialogRef.current = node;
            }}
            tabIndex={-1}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[calc(env(safe-area-inset-top)+58px)] right-3 left-3 sm:left-auto sm:w-[320px] surface rounded-[var(--radius-lg)] outline-none shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-[13px] font-medium text-[color:var(--color-text)]">
                {t('common:language.label')}
              </h2>
              <IconButton
                label={t('common:actions.close')}
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X />
              </IconButton>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-faint)]">
                  {t('common:language.uiLabel')}
                </span>
                <LanguageSwitcher />
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-faint)]">
                    {t('common:language.apiLabel')}
                  </span>
                  {localeDrifted && (
                    <span className="text-[10.5px] text-[color:var(--color-text-faint)]">
                      {t('parameters:labelLocale.driftHint')}
                    </span>
                  )}
                </div>
                <LabelLocaleSwitcher />
              </section>

              {canReanalyze && localeDrifted && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-[11.5px] leading-[1.5] text-[color:var(--color-text-soft)]">
                    {t('parameters:reanalyze.message')}
                  </p>
                  <Button
                    variant="subtle"
                    size="sm"
                    leading={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />}
                    onClick={() => {
                      void startAnalysis();
                      onClose();
                    }}
                    className="self-start"
                  >
                    {t('parameters:reanalyze.button')}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
