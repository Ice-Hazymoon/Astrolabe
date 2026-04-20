import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { LABEL_LOCALES } from '@/data/defaults';
import { cn } from '@/lib/cn';
import type { Locale } from '@/types/api';

interface LabelLocaleSwitcherProps {
  className?: string;
}

export function LabelLocaleSwitcher({ className }: LabelLocaleSwitcherProps) {
  const { t } = useTranslation('common');
  const locale = useSky((s) => s.locale);
  const setLocale = useSky((s) => s.setLocale);

  return (
    <div className={cn('relative', className)}>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language.apiLabel')}
        className="w-full appearance-none rounded-full bg-[color:var(--color-ink-2)]/80 border border-[color:var(--color-line-soft)] px-3.5 py-2 pr-9 text-[12.5px] text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-3)]/50 transition-colors"
      >
        {LABEL_LOCALES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--color-text-muted)]"
      >
        ▾
      </span>
    </div>
  );
}
