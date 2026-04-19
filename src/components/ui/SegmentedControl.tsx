import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange(value: T): void;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    const wrapped = (index + options.length) % options.length;
    buttonsRef.current[wrapped]?.focus();
    onChange(options[wrapped].value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        focusOption(options.length - 1);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative inline-flex w-full items-center rounded-full bg-[color:var(--color-ink-2)]/80 border border-[color:var(--color-line-soft)] p-[3px]"
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative flex-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-200',
              active
                ? 'bg-[color:var(--color-star)]/95 text-[color:var(--color-ink-0)] shadow-[var(--shadow-soft)]'
                : 'text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)]',
            )}
          >
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
