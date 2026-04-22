import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface BlurImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function BlurImage({ src, className, alt, ...rest }: BlurImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;

  return (
    <img
      src={src}
      alt={alt ?? ''}
      onLoad={() => setLoadedSrc(src)}
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
