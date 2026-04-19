import { useTranslation } from 'react-i18next';
import { ParameterPanel } from './ParameterPanel';

export function ParameterSidebar() {
  const { t } = useTranslation('parameters');
  return (
    <aside className="hidden lg:flex shrink-0 w-[340px] h-full pr-3 py-3">
      <div className="surface relative w-full h-full rounded-[var(--radius-lg)] p-4 flex flex-col gap-4 min-h-0">
        <header className="flex items-baseline justify-between shrink-0">
          <h2 className="text-display text-[15px] text-[color:var(--color-text)]">{t('title')}</h2>
          <span className="text-[10.5px] text-[color:var(--color-text-faint)] tracking-[0.18em] uppercase">
            {t('eyebrow')}
          </span>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-2">
          <ParameterPanel />
        </div>
      </div>
    </aside>
  );
}
