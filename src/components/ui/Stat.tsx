import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-0.5 min-w-0', className)}>
      <span className="text-eyebrow">{label}</span>
      <span className="text-display text-[15px] text-[color:var(--color-text)] truncate">
        {value}
      </span>
      {hint && (
        <span className="text-[11px] text-[color:var(--color-text-muted)] truncate">{hint}</span>
      )}
    </div>
  );
}
