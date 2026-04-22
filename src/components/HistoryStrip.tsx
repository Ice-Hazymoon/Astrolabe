import { motion, AnimatePresence } from 'framer-motion';
import { History, Trash2, X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { IconButton } from './ui/IconButton';
import { cn } from '@/lib/cn';

function formatRelative(timestamp: number, fmt: Intl.RelativeTimeFormat): string {
  const diff = (timestamp - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return fmt.format(Math.round(diff), 'second');
  if (abs < 3600) return fmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return fmt.format(Math.round(diff / 3600), 'hour');
  return fmt.format(Math.round(diff / 86400), 'day');
}

interface HistoryStripProps {
  onClose?(): void;
}

export function HistoryStrip({ onClose }: HistoryStripProps = {}) {
  const { t, i18n } = useTranslation('history');
  const entries = useSky((s) => s.history);
  const restore = useSky((s) => s.restoreFromHistory);
  const remove = useSky((s) => s.removeFromHistory);
  const clear = useSky((s) => s.clearHistory);
  const currentResult = useSky((s) => s.result);

  // Recreate the formatter whenever the active UI language changes so relative
  // timestamps read naturally in the user's locale without a full remount.
  const relativeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.resolvedLanguage || i18n.language, { numeric: 'auto' }),
    [i18n.resolvedLanguage, i18n.language],
  );

  return (
    <section className="relative z-10 shrink-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
      <div className="surface relative overflow-hidden rounded-[var(--radius-lg)] flex flex-col sm:flex-row sm:items-stretch sm:h-[110px]">
        <div
          className={cn(
            'shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--color-line-soft)]/60',
            'sm:min-w-[108px] sm:flex-col sm:items-start sm:justify-between sm:gap-1 sm:pl-4 sm:pr-3 sm:py-3',
            'sm:border-b-0 sm:border-r',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <History className="h-3.5 w-3.5 text-[color:var(--color-text-muted)]" strokeWidth={2.2} />
              <span className="text-eyebrow">{t('title')}</span>
            </div>
            <span className="text-mono text-[11px] text-[color:var(--color-text)] tabular-nums shrink-0">
              {entries.length.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {entries.length > 0 && (
              <IconButton label={t('clearAll')} variant="ghost" size="sm" onClick={clear}>
                <Trash2 />
              </IconButton>
            )}
            {onClose && (
              <IconButton label={t('collapse')} variant="ghost" size="sm" onClick={onClose}>
                <X />
              </IconButton>
            )}
          </div>
        </div>

        <div className="relative flex-1 min-w-0 min-h-[96px] sm:min-h-0">
          {entries.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center px-4 text-[12px] text-[color:var(--color-text-muted)] tracking-wide">
              <span>{t('empty')}</span>
            </div>
          ) : (
            <ul className="absolute inset-0 flex items-center gap-2.5 overflow-x-auto px-3 py-2.5 sm:py-0">
              <AnimatePresence initial={false}>
                {entries.map((entry) => {
                  const active = currentResult === entry.result;
                  return (
                    <motion.li
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="group relative shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => restore(entry)}
                        aria-label={t('restore', { name: entry.fileName ?? t('untitled') })}
                        className={cn(
                          'relative h-[74px] sm:h-[86px] aspect-[4/3] rounded-[var(--radius-sm)] overflow-hidden block',
                          'border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                          active
                            ? 'border-[color:var(--color-star)]/70 ring-2 ring-[color:var(--color-star)]/30'
                            : 'border-[color:var(--color-line-soft)] hover:border-[color:var(--color-line)] hover:scale-[1.02]',
                        )}
                      >
                        <img
                          src={entry.thumbDataUrl}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 flex items-center justify-between">
                          <span className="text-[10px] text-white/85 tracking-wide truncate">
                            {formatRelative(entry.createdAt, relativeFormatter)}
                          </span>
                          <span className="text-mono text-[9.5px] text-white/65 tabular-nums">
                            {entry.result.visible_named_stars.length}★
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={t('remove')}
                        onClick={(event) => {
                          event.stopPropagation();
                          remove(entry.id);
                        }}
                        className={cn(
                          'absolute -top-1 -right-1 h-5 w-5 rounded-full grid place-items-center',
                          'bg-[color:var(--color-ink-0)]/85 border border-[color:var(--color-line)]',
                          'text-[color:var(--color-text-soft)] hover:text-[color:var(--color-danger)]',
                          'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 transition-opacity',
                          'focus-visible:opacity-100',
                        )}
                      >
                        <X className="h-3 w-3" strokeWidth={2.4} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
