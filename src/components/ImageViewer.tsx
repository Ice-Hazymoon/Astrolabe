import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2, Expand, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './ui/IconButton';
import { cn } from '@/lib/cn';

interface ImageViewerProps {
  src: string;
  alt: string;
  /** When true, overlay an ambient twinkle effect on top of the image. */
  twinkle?: boolean;
  className?: string;
  /** Render content overlaid on top of the image (e.g. quick-action buttons). */
  topRight?: React.ReactNode;
  /** Re-key animations when this value changes (e.g. when switching between original / annotated). */
  cacheKey?: string;
  /** Pixels reserved at the bottom for an external overlay (e.g. a details sheet). */
  bottomOffset?: number;
  /** Pixels of bottom space the image should *not* render into — keeps the fitted image
   * clear of an external panel sitting below it (e.g. the result details sheet). */
  reservedBottom?: number;
  /** Whether the viewer is currently displayed in fullscreen mode. */
  fullscreen?: boolean;
  /** Optional toggle handler — when provided, an expand/shrink button is shown. */
  onToggleFullscreen?(): void;
  /** Apply a subtle CSS filter to lift thin annotation lines off a dark sky background. */
  enhance?: boolean;
  /** Arbitrary content layered inside the image box, sharing its aspect ratio and zoom. */
  overlay?: React.ReactNode;
}

const TWINKLES = [
  { top: '18%', left: '24%', delay: '0s' },
  { top: '32%', left: '64%', delay: '1.4s' },
  { top: '58%', left: '38%', delay: '0.6s' },
  { top: '72%', left: '78%', delay: '2.1s' },
  { top: '46%', left: '12%', delay: '1.0s' },
  { top: '24%', left: '82%', delay: '2.6s' },
  { top: '84%', left: '52%', delay: '1.7s' },
  { top: '12%', left: '50%', delay: '0.3s' },
];

export function ImageViewer({
  src,
  alt,
  twinkle = false,
  className,
  topRight,
  cacheKey,
  bottomOffset = 10,
  reservedBottom = 0,
  fullscreen = false,
  onToggleFullscreen,
  enhance = false,
  overlay,
}: ImageViewerProps) {
  const { t } = useTranslation('viewer');
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset transform whenever the source image changes so the user always lands on a fitted view.
  useEffect(() => {
    setErrored(false);
    wrapperRef.current?.resetTransform(0);
    const img = imgRef.current;
    // When the browser has the image in cache, React may attach onLoad after decoding has
    // already finished — so the synthetic event never fires and we'd stay stuck in the
    // blurred loading state. Sync directly from the DOM element in that case.
    if (img && img.complete && img.naturalWidth > 0) {
      setAspectRatio(img.naturalWidth / img.naturalHeight);
      setLoaded(true);
    } else {
      setLoaded(false);
      setAspectRatio(null);
    }
  }, [src, cacheKey]);

  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setAspectRatio(img.naturalWidth / img.naturalHeight);
    }
    setLoaded(true);
    setErrored(false);
    wrapperRef.current?.resetTransform(0);
  }, []);

  const handleError = useCallback(() => {
    setErrored(true);
    setLoaded(false);
    // Surface to the console so someone debugging can see what URL failed.
    console.warn('[ImageViewer] failed to load image', { src: src.slice(0, 64), alt });
  }, [src, alt]);

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        'transition-[border-radius,border-color] duration-300',
        fullscreen
          ? 'rounded-none border-transparent'
          : 'rounded-[var(--radius-lg)] border border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-1)]/60 shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      {/* Ambient backdrop: the same photo, heavily blurred, sitting behind the fitted image
          so the bands on either side feel atmospheric instead of flat. Stays put while
          the foreground image pans/zooms. */}
      {!errored && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={src}
            alt=""
            draggable={false}
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover scale-110 blur-xl opacity-60 select-none"
            style={{ filter: 'blur(24px) saturate(1.05)' }}
          />
          <div className="absolute inset-0 bg-[color:var(--color-ink-0)]/35" />
        </div>
      )}

      <TransformWrapper
        ref={wrapperRef}
        initialScale={1}
        minScale={1}
        maxScale={6}
        centerOnInit
        centerZoomedOut
        wheel={{ step: 0.18 }}
        pinch={{ step: 6 }}
        doubleClick={{ mode: 'zoomIn', step: 0.8, animationTime: 280 }}
        panning={{ velocityDisabled: true }}
        limitToBounds
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{
                width: '100%',
                height: '100%',
              }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                className={cn(
                  'relative shrink-0 overflow-hidden transition-[opacity,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  loaded ? 'opacity-100 blur-0' : 'opacity-50 blur-2xl',
                )}
                style={{
                  // Size the wrapper to match the image's displayed bounds via aspect-ratio.
                  // This makes overlays (twinkles, future constellation lines) align with the image
                  // and travel with it through the zoom/pan transform.
                  aspectRatio: aspectRatio ?? '4 / 5',
                  height: '100%',
                  // Shrink the fitted (scale=1) image to leave symmetric top/bottom
                  // breathing room for an external panel below. Because this caps the
                  // layout size — not the transform — zooming still lets the user
                  // pan/scale into the full canvas area.
                  maxHeight: reservedBottom > 0 ? `calc(100% - ${reservedBottom * 2}px)` : '100%',
                  maxWidth: '100%',
                }}
              >
                <img
                  ref={imgRef}
                  src={src}
                  alt={alt}
                  onLoad={handleLoad}
                  onError={handleError}
                  draggable={false}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
                  style={
                    enhance
                      ? { filter: 'brightness(1.06) contrast(1.05) saturate(1.06)' }
                      : undefined
                  }
                />

                {twinkle && loaded && (
                  <div aria-hidden className="absolute inset-0 mix-blend-screen pointer-events-none">
                    {TWINKLES.map((t, i) => (
                      <span
                        key={i}
                        className="twinkle-dot"
                        style={{ top: t.top, left: t.left, animationDelay: t.delay }}
                      />
                    ))}
                  </div>
                )}

                {overlay && loaded && (
                  <div aria-hidden className="absolute inset-0 pointer-events-none">
                    {overlay}
                  </div>
                )}
              </div>
            </TransformComponent>

            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/35 to-transparent" />

            {errored && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
                <div className="surface rounded-[var(--radius-md)] px-4 py-3 max-w-sm">
                  <p className="text-[12.5px] text-[color:var(--color-text)]">{t('loadFailed')}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)] break-all">
                    {src.startsWith('blob:')
                      ? t('sourceBlobInvalid')
                      : src.startsWith('data:')
                        ? t('sourceDataInvalid')
                        : src}
                  </p>
                </div>
              </div>
            )}

            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
              {topRight}
              {onToggleFullscreen && (
                <div className="surface rounded-full p-0.5">
                  <IconButton
                    label={fullscreen ? t('fullscreenExit') : t('fullscreenEnter')}
                    variant="ghost"
                    size="sm"
                    onClick={onToggleFullscreen}
                  >
                    {fullscreen ? <Shrink /> : <Expand />}
                  </IconButton>
                </div>
              )}
            </div>

            <div
              className="absolute right-2.5 flex items-center gap-1 z-10"
              style={{ bottom: bottomOffset }}
            >
              <div className="surface flex items-center gap-0.5 rounded-full p-0.5">
                <IconButton label={t('zoomOut')} variant="ghost" size="sm" onClick={() => zoomOut(0.4)}>
                  <ZoomOut />
                </IconButton>
                <IconButton label={t('zoomIn')} variant="ghost" size="sm" onClick={() => zoomIn(0.4)}>
                  <ZoomIn />
                </IconButton>
                <IconButton label={t('reset')} variant="ghost" size="sm" onClick={() => resetTransform(280)}>
                  <Maximize2 />
                </IconButton>
              </div>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
