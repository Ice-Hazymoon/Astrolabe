import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  leading?: ReactNode;
  trailing?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[color:var(--color-star)] text-[color:var(--color-ink-0)] hover:brightness-110 active:brightness-95 shadow-[var(--shadow-soft)]',
  ghost:
    'bg-transparent text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-2)]/60',
  subtle:
    'bg-[color:var(--color-ink-2)]/70 text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-3)]/80 border border-[color:var(--color-line-soft)]',
  danger:
    'bg-transparent text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/12',
};

const sizes = {
  sm: 'h-8 px-3 text-[12px] gap-1.5',
  md: 'h-10 px-4 text-[13px] gap-2',
  lg: 'h-12 px-5 text-[14px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'subtle', size = 'md', className, leading, trailing, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-full whitespace-nowrap transition-[background-color,color,transform,filter,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {leading}
      <span className="leading-none">{children}</span>
      {trailing}
    </button>
  );
});
