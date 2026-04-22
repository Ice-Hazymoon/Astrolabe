import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { ParameterPanel } from './ParameterPanel';
import { IconButton } from './ui/IconButton';

interface ParameterDrawerProps {
  open: boolean;
  onClose(): void;
}

export function ParameterDrawer({ open, onClose }: ParameterDrawerProps) {
  const { t } = useTranslation(['parameters', 'common', 'app']);
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    if (previouslyFocused instanceof HTMLElement) {
      restoreFocusRef.current = previouslyFocused;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            ref={(node) => {
              dialogRef.current = node;
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t('app:topbar.settings')}
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            // Drag is initiated only from the handle (see onPointerDown below) so internal scrolling works.
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 480) onClose();
            }}
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] surface rounded-t-[var(--radius-xl)] flex flex-col outline-none"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div
              onPointerDown={(event) => dragControls.start(event)}
              className="shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <div className="flex items-center justify-center pt-3 pb-1.5">
                <span aria-hidden className="h-1 w-10 rounded-full bg-[color:var(--color-line)]" />
              </div>
              <header className="flex items-center justify-between px-5 pt-1 pb-3">
                <h2 className="text-display text-[16px] text-[color:var(--color-text)]">{t('parameters:title')}</h2>
                <IconButton
                  label={t('common:actions.close')}
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  // Prevent the close-button press from also starting a drag.
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <X />
                </IconButton>
              </header>
            </div>

            <div className="px-5 pb-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <ParameterPanel />
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
