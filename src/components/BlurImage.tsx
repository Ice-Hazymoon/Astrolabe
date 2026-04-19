import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface BlurImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function BlurImage({ src, className, alt, ...rest }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    if (ref.current?.complete && ref.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt ?? ''}
      onLoad={() => setLoaded(true)}
      draggable={false}
      className={cn(
        'transition-[filter,opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
        loaded
          ? 'opacity-100 blur-0 scale-100'
          : 'opacity-60 blur-xl scale-[1.02]',
        className,
      )}
      {...rest}
    />
  );
}
