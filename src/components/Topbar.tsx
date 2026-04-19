import { SlidersHorizontal, RefreshCw, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { IconButton } from './ui/IconButton';
import { Logo } from './ui/Logo';
import { cn } from '@/lib/cn';

interface TopbarProps {
  onOpenSettings(): void;
  onToggleHistory(): void;
  historyOpen: boolean;
}

export function Topbar({ onOpenSettings, onToggleHistory, historyOpen }: TopbarProps) {
  const { t } = useTranslation('app');
  const phase = useSky((s) => s.phase);
  const reset = useSky((s) => s.reset);
  const historyCount = useSky((s) => s.history.length);

  return (
    <header className="relative z-30 flex items-center justify-between px-4 sm:px-6 h-[52px] shrink-0 border-b border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-0)]/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-ink-2)] border border-[color:var(--color-line-soft)] shrink-0">
          <Logo className="h-4 w-4 text-[color:var(--color-star)]" />
          <span className="absolute -inset-1 rounded-full bg-[color:var(--color-star)]/10 blur-md -z-10" />
        </span>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-display text-[16px] tracking-tight text-[color:var(--color-text)]">
            {t('brand')}
          </span>
          <span className="hidden sm:inline text-[11.5px] text-[color:var(--color-text-muted)]">
            {t('tagline')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <IconButton
            label={historyOpen ? t('topbar.closeHistory') : t('topbar.openHistory')}
            variant={historyOpen ? 'subtle' : 'ghost'}
            size="sm"
            onClick={onToggleHistory}
          >
            <History />
          </IconButton>
          {historyCount > 0 && !historyOpen && (
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1',
                'rounded-full grid place-items-center',
                'bg-[color:var(--color-star)] text-[9px] font-medium text-black/80 tabular-nums',
              )}
            >
              {historyCount > 9 ? '9+' : historyCount}
            </span>
          )}
        </div>
        <IconButton
          label={t('topbar.restart')}
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={phase === 'idle'}
        >
          <RefreshCw />
        </IconButton>
        <IconButton
          label={t('topbar.settings')}
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          className="lg:hidden"
        >
          <SlidersHorizontal />
        </IconButton>
      </div>
    </header>
  );
}
