import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, ExternalLink, X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import type { InstallPlatform } from '@/pwa/usePwaInstall';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

interface PwaInstallDialogProps {
  open: boolean;
  canPrompt: boolean;
  platform: InstallPlatform;
  onClose(): void;
  onInstall(): void | Promise<void>;
}

export function PwaInstallDialog({
  open,
  canPrompt,
  platform,
  onClose,
  onInstall,
}: PwaInstallDialogProps) {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const steps = useMemo(() => {
    switch (platform) {
      case 'ios':
        return [
          t('pwa.steps.ios1'),
          t('pwa.steps.ios2'),
          t('pwa.steps.ios3'),
        ];
      case 'android':
        return [
          t('pwa.steps.android1'),
          t('pwa.steps.android2'),
          t('pwa.steps.android3'),
        ];
      case 'desktop':
      default:
        return [
          t('pwa.steps.desktop1'),
          t('pwa.steps.desktop2'),
          t('pwa.steps.desktop3'),
        ];
    }
  }, [platform, t]);

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
        <div
          className="fixed inset-0 z-[85]"
          aria-modal="true"
          role="dialog"
          aria-label={t('pwa.title')}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-[color:var(--color-ink-0)]/45 backdrop-blur-sm"
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
            className="absolute top-[calc(env(safe-area-inset-top)+58px)] right-3 left-3 sm:left-auto sm:w-[360px] surface rounded-[var(--radius-lg)] outline-none shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-star)]/14 text-[color:var(--color-star)]">
                  <ArrowDownToLine className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <h2 className="min-w-0 text-[13px] font-medium text-[color:var(--color-text)]">
                  {t('pwa.title')}
                </h2>
              </div>
              <IconButton
                label={t('actions.close')}
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X />
              </IconButton>
            </div>

            <div className="flex flex-col gap-4 px-4 pb-4">
              <p className="text-[12.5px] leading-[1.55] text-[color:var(--color-text-soft)]">
                {t('pwa.description')}
              </p>

              {canPrompt && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-2)]/45 p-3">
                  <p className="text-[11.5px] leading-[1.5] text-[color:var(--color-text-soft)]">
                    {t('pwa.nativeReady')}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
                    leading={<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={2.1} />}
                    onClick={() => void onInstall()}
                  >
                    {t('pwa.buttons.install')}
                  </Button>
                </div>
              )}

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-eyebrow">{t('pwa.manualTitle')}</span>
                  <span className="rounded-full border border-[color:var(--color-line-soft)] px-2 py-0.5 text-[10.5px] text-[color:var(--color-text-muted)]">
                    {t(`pwa.platform.${platform}`)}
                  </span>
                </div>
                <p className="text-[11.5px] leading-[1.5] text-[color:var(--color-text-faint)]">
                  {t('pwa.manualHint')}
                </p>
                <ol className="flex flex-col gap-2">
                  {steps.map((step, index) => (
                    <li
                      key={`${platform}-${index}`}
                      className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-2)]/28 px-3 py-2"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-ink-3)] text-[10.5px] text-[color:var(--color-text-soft)]">
                        {index + 1}
                      </span>
                      <span className="text-[12px] leading-[1.5] text-[color:var(--color-text-soft)]">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="flex items-center gap-2 text-[11px] leading-[1.45] text-[color:var(--color-text-faint)]">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span>{t('pwa.manualFootnote')}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
