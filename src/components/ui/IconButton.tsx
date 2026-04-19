import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'ghost' | 'solid' | 'subtle';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  label: string;
}

const variants: Record<Variant, string> = {
  ghost:
    'text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-2)]/60',
  subtle:
    'text-[color:var(--color-text)] bg-[color:var(--color-ink-2)]/70 hover:bg-[color:var(--color-ink-3)]/80 border border-[color:var(--color-line-soft)]',
  solid:
    'text-[color:var(--color-ink-0)] bg-[color:var(--color-star)] hover:brightness-110 shadow-[var(--shadow-soft)]',
};

const sizes = {
  sm: 'h-8 w-8 [&>svg]:h-3.5 [&>svg]:w-3.5',
  md: 'h-10 w-10 [&>svg]:h-4 [&>svg]:w-4',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-[background-color,color,transform,filter] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
