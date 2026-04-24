import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2, Expand, Shrink } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { IconButton } from './ui/IconButton';
import { cn } from '@/lib/cn';

type ViewerOverlay = React.ReactNode | ((isTransforming: boolean) => React.ReactNode);

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
  overlay?: ViewerOverlay;
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
  const [viewState, setViewState] = useState<{
    src: string | null;
    aspectRatio: number | null;
    loaded: boolean;
    errored: boolean;
  }>({
    src: null,
    aspectRatio: null,
    loaded: false,
    errored: false,
  });
  const [isTransforming, setIsTransforming] = useState(false);
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const transformIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransformingRef = useRef(false);
  const currentViewState = viewState.src === src
    ? viewState
    : { src: null, aspectRatio: null, loaded: false, errored: false };
  const { aspectRatio, loaded, errored } = currentViewState;
  const overlayContent = typeof overlay === 'function' ? overlay(isTransforming) : overlay;

  // Probe the image's natural dimensions *before* TransformWrapper mounts.
  // react-zoom-pan-pinch's `centerOnInit` measures the content box once on
  // mount and once more on the first ResizeObserver tick, then disconnects —
  // it does not re-center on subsequent content resizes. If we let the wrapper
  // mount with a fallback aspect ratio and then update it after <img> loads,
  // the initial centering runs against stale dimensions and the image lands
  // off-center (visible on wide landscapes against the default portrait
  // fallback). Holding mount back until we know the real ratio avoids that
  // race entirely: the wrapper's first measurement is already correct.
  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const probe = new Image();
    probe.decoding = 'async';
    const apply = () => {
      if (cancelled) return;
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setViewState({
          src,
          aspectRatio: probe.naturalWidth / probe.naturalHeight,
          loaded: false,
          errored: false,
        });
      } else {
        setViewState({
          src,
          aspectRatio: null,
          loaded: false,
          errored: true,
        });
      }
    };
    probe.onload = apply;
    probe.onerror = () => {
      if (cancelled) return;
      setViewState({
        src,
        aspectRatio: null,
        loaded: false,
        errored: true,
      });
      console.warn('[ImageViewer] failed to load image', { src: src.slice(0, 64) });
    };
    probe.src = src;
    // Fast path: some browsers serve fully-decoded cached images synchronously,
    // in which case onload never fires after we attach the handler.
    if (probe.complete && probe.naturalWidth > 0) apply();

    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src, cacheKey]);

  const handleLoad = useCallback(() => {
    setViewState((current) => ({
      src,
      aspectRatio: current.aspectRatio,
      loaded: true,
      errored: false,
    }));
  }, [src]);

  const handleError = useCallback(() => {
    setViewState((current) => ({
      src,
      aspectRatio: current.src === src ? current.aspectRatio : null,
      loaded: false,
      errored: true,
    }));
    console.warn('[ImageViewer] failed to load image', { src: src.slice(0, 64), alt });
  }, [src, alt]);

  const ready = aspectRatio != null;

  // Force a fresh TransformWrapper instance whenever the source or cache key
  // changes. Pairs with the probe above so each new image gets a clean
  // centerOnInit pass measured against the real aspect ratio.
  const wrapperKey = `${src}::${cacheKey ?? ''}`;

  const zoomIn = useCallback(() => wrapperRef.current?.zoomIn(0.4), []);
  const zoomOut = useCallback(() => wrapperRef.current?.zoomOut(0.4), []);
  const resetZoom = useCallback(() => wrapperRef.current?.resetTransform(280), []);
  const markTransforming = useCallback(() => {
    if (transformIdleTimerRef.current) {
      clearTimeout(transformIdleTimerRef.current);
      transformIdleTimerRef.current = null;
    }
    if (!isTransformingRef.current) {
      isTransformingRef.current = true;
      setIsTransforming(true);
    }
  }, []);
  const markTransformSettled = useCallback(() => {
    if (transformIdleTimerRef.current) clearTimeout(transformIdleTimerRef.current);
    transformIdleTimerRef.current = setTimeout(() => {
      transformIdleTimerRef.current = null;
      isTransformingRef.current = false;
      setIsTransforming(false);
    }, 140);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;

    let raf = 0;
    const recenter = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ref = wrapperRef.current;
        if (!ref) return;
        if (ref.state.scale <= 1.0001) ref.centerView(1, 0);
      });
    };

    recenter();
    const observer = new ResizeObserver(() => recenter());
    observer.observe(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ready, wrapperKey]);

  useEffect(() => {
    return () => {
      if (transformIdleTimerRef.current) clearTimeout(transformIdleTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative h-full w-full overflow-hidden',
        'transition-[border-radius,border-color] duration-300',
        fullscreen
          ? 'rounded-none border-transparent'
          : 'sm:rounded-[var(--radius-lg)] sm:border sm:border-[color:var(--color-line-soft)] sm:bg-[color:var(--color-ink-1)]/60 sm:shadow-[var(--shadow-lift)]',
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

      {ready && (
        <TransformWrapper
          key={wrapperKey}
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
          onPanningStart={markTransforming}
          onPanning={markTransforming}
          onPanningStop={markTransformSettled}
          onWheelStart={markTransforming}
          onWheel={markTransforming}
          onWheelStop={markTransformSettled}
          onPinchStart={markTransforming}
          onPinch={markTransforming}
          onPinchStop={markTransformSettled}
          onZoomStart={markTransforming}
          onZoom={markTransforming}
          onZoomStop={markTransformSettled}
        >
          {/* TransformComponent's wrapper spans the full viewport so zoom/pan
              bounds live in viewport coordinates — zoomed-in, the image can
              pan all the way to the screen edges. The content is image-aspect
              sized via contentStyle, so the library still knows the actual
              image extent: the dimension where content < wrapper stays
              centered (no empty pan), and the dimension where content >= wrapper
              covers the wrapper at the extremes (no letterbox exposure inside
              the image). */}
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{
              aspectRatio,
              height: '100%',
              maxHeight: reservedBottom > 0 ? `calc(100% - ${reservedBottom * 2}px)` : '100%',
              maxWidth: '100%',
            }}
          >
            <div
              className={cn(
                'relative h-full w-full overflow-hidden transition-[opacity,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                loaded ? 'opacity-100 blur-0' : 'opacity-50 blur-2xl',
              )}
            >
              <img
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

              {overlayContent && loaded && (
                <div aria-hidden className="absolute inset-0 pointer-events-none">
                  {overlayContent}
                </div>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      )}

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
          <IconButton label={t('zoomOut')} variant="ghost" size="sm" onClick={zoomOut} disabled={!ready}>
            <ZoomOut />
          </IconButton>
          <IconButton label={t('zoomIn')} variant="ghost" size="sm" onClick={zoomIn} disabled={!ready}>
            <ZoomIn />
          </IconButton>
          <IconButton label={t('reset')} variant="ghost" size="sm" onClick={resetZoom} disabled={!ready}>
            <Maximize2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
