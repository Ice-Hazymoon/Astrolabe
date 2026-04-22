import {
  SlidersHorizontal,
  History,
  Languages,
  ArrowDownToLine,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/i18n/useTranslation';
import { IconButton } from './ui/IconButton';
import { Logo } from './ui/Logo';
import { XGlyph } from './ui/XGlyph';
import { cn } from '@/lib/cn';

const FOLLOW_URL = 'https://x.com/GetZTools';

interface TopbarProps {
  onOpenSettings(): void;
  onOpenLanguageSettings(): void;
  onOpenPwaInstall(): void;
  onToggleHistory(): void;
  historyOpen: boolean;
  showPwaInstall: boolean;
  installPromptAvailable: boolean;
}

const TopbarApiWarning = dynamic(
  () => import('./TopbarApiWarning').then((m) => m.TopbarApiWarning),
  { ssr: false, loading: () => null },
);

const TopbarHistoryBadge = dynamic(
  () => import('./TopbarHistoryBadge').then((m) => m.TopbarHistoryBadge),
  { ssr: false, loading: () => null },
);

export function Topbar({
  onOpenSettings,
  onOpenLanguageSettings,
  onOpenPwaInstall,
  onToggleHistory,
  historyOpen,
  showPwaInstall,
  installPromptAvailable,
}: TopbarProps) {
  const { t } = useTranslation(['app', 'common']);
  const followLabel = t('common:social.followOnX');

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
        <TopbarApiWarning />
        <div className="relative">
          <IconButton
            label={historyOpen ? t('topbar.closeHistory') : t('topbar.openHistory')}
            variant={historyOpen ? 'subtle' : 'ghost'}
            size="sm"
            onClick={onToggleHistory}
          >
            <History />
          </IconButton>
          <TopbarHistoryBadge historyOpen={historyOpen} />
        </div>
        <a
          href={FOLLOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={followLabel}
          title={followLabel}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-full',
            'text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)]',
            'hover:bg-[color:var(--color-ink-2)]/60',
            'transition-[background-color,color,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-star)]/60',
          )}
        >
          <XGlyph className="h-3.5 w-3.5" />
        </a>
        {showPwaInstall && (
          <IconButton
            label={
              installPromptAvailable ? t('common:pwa.statusReady') : t('common:pwa.statusManual')
            }
            variant={installPromptAvailable ? 'subtle' : 'ghost'}
            size="sm"
            onClick={onOpenPwaInstall}
            className={cn(
              installPromptAvailable && 'text-[color:var(--color-star)] hover:text-[color:var(--color-star)]',
            )}
          >
            <ArrowDownToLine />
          </IconButton>
        )}
        <IconButton
          label={t('common:language.label')}
          variant="ghost"
          size="sm"
          onClick={onOpenLanguageSettings}
          className="opacity-70 hover:opacity-100"
        >
          <Languages />
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
