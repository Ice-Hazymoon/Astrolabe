import { useId } from 'react';
import { cn } from '@/lib/cn';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (value: number) => string;
  onChange(value: number): void;
  hint?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  format,
  onChange,
  hint,
}: SliderProps) {
  const id = useId();
  const display = format ? format(value) : `${value}${unit ?? ''}`;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] text-[color:var(--color-text-soft)]">
          {label}
        </label>
        <span className="text-mono text-[11.5px] text-[color:var(--color-text)] tabular-nums">
          {display}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-[color:var(--color-ink-3)]/70" />
        <div
          aria-hidden
          className="absolute h-[3px] rounded-full bg-[color:var(--color-star)]/85"
          style={{ width: `${pct}%` }}
        />
        <input
          id={id}
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'relative w-full h-5 appearance-none bg-transparent cursor-pointer',
            // WebKit thumb
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.45),0_0_0_3px_oklch(0.86_0.13_78/_0.18)]',
            '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            '[&::-webkit-slider-thumb]:active:scale-95',
            // Firefox thumb
            '[&::-moz-range-thumb]:appearance-none',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:border-none',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-white',
            '[&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.45),0_0_0_3px_oklch(0.86_0.13_78/_0.18)]',
          )}
        />
      </div>
      {hint && (
        <p className="text-[11px] text-[color:var(--color-text-muted)] leading-snug">{hint}</p>
      )}
    </div>
  );
}
