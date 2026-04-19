import { useId } from 'react';
import { cn } from '@/lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange(value: boolean): void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'group flex items-center gap-3 py-2 cursor-pointer select-none',
        description && 'items-start',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-[20px] w-[34px] shrink-0',
          description && 'mt-[3px]',
        )}
      >
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full transition-colors duration-200 ease-out',
            'bg-[color:var(--color-ink-3)]/80 peer-checked:bg-[color:var(--color-star)]',
            'border border-[color:var(--color-line-soft)] peer-checked:border-transparent',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-star)]/60',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-full bg-white',
            'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            'shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
            'peer-checked:translate-x-[14px]',
          )}
        />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-[13px] text-[color:var(--color-text)] leading-[1.35]">{label}</span>
        {description && (
          <span className="text-[11.5px] text-[color:var(--color-text-muted)] leading-tight">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
