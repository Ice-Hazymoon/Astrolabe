import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { UI_LANGUAGES } from './languages';
import { cn } from '@/lib/cn';

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Dropdown for switching the interface language. Visual treatment matches the
 * other pill-shaped selects used in the parameter panel so the two language
 * controls read as a coherent pair without pulling focus.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation('common');
  const current = i18n.resolvedLanguage || i18n.language;

  return (
    <div className={cn('relative', className)}>
      <Languages
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[color:var(--color-text-muted)]"
        strokeWidth={2}
      />
      <select
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        aria-label={t('language.switchAria')}
        className="w-full appearance-none rounded-full bg-[color:var(--color-ink-2)]/80 border border-[color:var(--color-line-soft)] pl-9 pr-9 py-2 text-[12.5px] text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-3)]/50 transition-colors"
      >
        {UI_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeLabel}
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
