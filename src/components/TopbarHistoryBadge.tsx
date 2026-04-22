'use client';

import { useSky } from '@/state/store';
import { cn } from '@/lib/cn';

interface TopbarHistoryBadgeProps {
  historyOpen: boolean;
}

export function TopbarHistoryBadge({ historyOpen }: TopbarHistoryBadgeProps) {
  const historyCount = useSky((s) => s.history.length);

  if (historyOpen || historyCount <= 0) return null;

  return (
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
  );
}
