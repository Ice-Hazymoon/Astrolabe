'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useSky } from '@/state/store';
import { cn } from '@/lib/cn';

export function TopbarApiWarning() {
  const { t } = useTranslation(['app', 'common']);
  const apiStatus = useSky((s) => s.apiStatus);
  const refreshApi = useSky((s) => s.refreshApi);

  if (apiStatus !== 'offline') return null;

  return (
    <button
      type="button"
      onClick={() => void refreshApi()}
      className={cn(
        'inline-flex h-8 max-w-[220px] items-center gap-2 rounded-[8px] border px-2.5 text-[11.5px] transition-colors',
        'border-[color:var(--color-star)]/28 bg-[color:var(--color-star)]/10 text-[color:var(--color-star)]',
        'hover:bg-[color:var(--color-star)]/14',
      )}
      title={t('topbar.apiWarning')}
      aria-label={t('topbar.apiWarning')}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      <span className="hidden truncate sm:inline">{t('topbar.apiWarningShort')}</span>
    </button>
  );
}
