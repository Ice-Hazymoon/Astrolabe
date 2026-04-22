import { forwardRef, type ImgHTMLAttributes } from 'react';

/**
 * Brand mark used in the app shell. Rendered as a transparent PNG so the UI,
 * exported strip, favicon set, and PWA icons all share the same generated logo.
 */
export const Logo = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(function Logo(
  { alt = '', src = '/logo-mark.png', draggable = false, ...rest },
  ref,
) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      draggable={draggable}
      aria-hidden
      {...rest}
    />
  );
});
