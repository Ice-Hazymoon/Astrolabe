import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Download, Film, MapPin, Navigation, Loader2, LocateFixed, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnalyzeResponse, OverlayOptions, OverlayScene } from '@/types/api';
import {
  buildStripSvg,
  composeAnnotatedWithStrip,
  stripHeightFor,
  type StripMeta,
} from '@/lib/composite';
import {
  exportAnnotatedVideo,
  isVideoExportSupported,
  WebCodecsUnsupportedError,
} from '@/lib/videoExport';
import { reverseLookup, searchPlaces, type NominatimHit } from '@/lib/nominatim';
import { SITE_HOST, SITE_NAME } from '@/lib/config';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Switch } from './ui/Switch';
import { OverlayCanvas } from './OverlayCanvas';
import { cn } from '@/lib/cn';

function stripDomSvg(markup: string): string {
  // The saved SVG has explicit pixel width/height for canvas rasterization.
  // For DOM rendering we drop those so the SVG scales to its container.
  return markup.replace(/<svg([^>]*?)\swidth="\d+"\s+height="\d+"/, '<svg$1');
}

interface ExportDialogProps {
  open: boolean;
  onClose(): void;
  /** Called after save with the blob URL of the exported PNG — enables a follow-up share dialog. */
  onExported(blobUrl: string, meta: StripMeta): void;
  imageSrc: string;
  scene: OverlayScene;
  layers: OverlayOptions['layers'];
  result: AnalyzeResponse;
}

function parseSigned(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/°/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatCoordinates(lat: string, lng: string): string {
  const latN = parseSigned(lat);
  const lngN = parseSigned(lng);
  const parts: string[] = [];
  if (latN !== null) {
    parts.push(`${Math.abs(latN).toFixed(4)}°${latN >= 0 ? 'N' : 'S'}`);
  } else if (lat.trim()) {
    parts.push(lat.trim());
  }
  if (lngN !== null) {
    parts.push(`${Math.abs(lngN).toFixed(4)}°${lngN >= 0 ? 'E' : 'W'}`);
  } else if (lng.trim()) {
    parts.push(lng.trim());
  }
  return parts.join('   ');
}

export function ExportDialog({
  open,
  onClose,
  onExported,
  imageSrc,
  scene,
  layers,
  result,
}: ExportDialogProps) {
  const { t, i18n } = useTranslation(['export', 'common', 'result']);
  // Mirror the live overlay's per-item hide/solo selections in the exported PNG.
  // Read through the store so updates made while the dialog is open re-bind on
  // the next save click without needing the parent to re-thread props.
  const detailsFilters = useSky((s) => s.detailsFilters);
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [includeStrip, setIncludeStrip] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  // `null` = still feature-detecting, `true`/`false` once the probe resolves.
  // Separates "haven't checked yet" from "definitely unsupported" so the
  // video button can stay hidden until we know one way or the other.
  const [videoSupported, setVideoSupported] = useState<boolean | null>(null);
  const [videoPct, setVideoPct] = useState(0);
  const videoAbortRef = useRef<AbortController | null>(null);
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // If the value was just written by a suggestion or geolocation pick, suppress
  // the next debounced search — the user didn't type, and we already know the
  // lat/lng, so re-querying just to confirm the same string would be wasted.
  const skipNextSearchRef = useRef(false);
  const [geoState, setGeoState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const locationWrapRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Keep Escape-handler state in refs so the focus-management effect below
  // doesn't re-run (and steal focus from the active input) every time
  // `saving` or `searchOpen` flips.
  const savingRef = useRef(saving);
  const searchOpenRef = useRef(searchOpen);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);
  useEffect(() => {
    searchOpenRef.current = searchOpen;
  }, [searchOpen]);

  useEffect(() => {
    if (!open) return;
    setSavingError(null);
    setGeoError(null);
    const prev = document.activeElement;
    if (prev instanceof HTMLElement) restoreFocusRef.current = prev;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingRef.current) {
        if (searchOpenRef.current) {
          setSearchOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  // Close the suggestion list when the user clicks outside of the location
  // wrapper (input + dropdown). Scoped to the dialog so it doesn't fight
  // with the backdrop click-to-close handler.
  useEffect(() => {
    if (!open || !searchOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (!locationWrapRef.current) return;
      if (e.target instanceof Node && locationWrapRef.current.contains(e.target)) return;
      setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, searchOpen]);

  // Debounced nominatim search while the user types a place name. Aborts the
  // in-flight request whenever the query changes, keeping the suggestions in
  // step with the latest input.
  useEffect(() => {
    if (!open) return;
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const q = locationName.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchPlaces(q, {
          signal: controller.signal,
          language: i18n.resolvedLanguage ?? i18n.language,
        });
        setSuggestions(hits);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[ExportDialog] nominatim search failed', err);
          setSuggestions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 420);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [i18n.language, i18n.resolvedLanguage, locationName, open]);

  // Show the live host on the strip so screenshots from a preview deploy don't
  // silently claim to come from production.
  const siteHost =
    typeof window !== 'undefined' && window.location.host ? window.location.host : SITE_HOST;

  const meta: StripMeta = useMemo(
    () => ({
      locationName,
      coordinates: formatCoordinates(lat, lng),
      siteName: SITE_NAME,
      siteUrl: siteHost,
      stats: {
        stars: result.visible_named_stars.length,
        constellations: result.visible_constellations.length,
        deepSky: result.visible_deep_sky_objects.length,
        labels: {
          stars: t('result:details.tabs.stars'),
          constellations: t('result:details.tabs.constellations'),
          deepSky: t('result:details.tabs.dso'),
        },
      },
    }),
    [
      t,
      locationName,
      lat,
      lng,
      siteHost,
      result.visible_named_stars.length,
      result.visible_constellations.length,
      result.visible_deep_sky_objects.length,
    ],
  );

  const imgW = scene.image_width;
  const imgH = scene.image_height;
  const stripH = stripHeightFor(imgW);
  const stripMarkup = useMemo(
    () => stripDomSvg(buildStripSvg(imgW, stripH, meta)),
    [imgW, stripH, meta],
  );

  const pickSuggestion = (hit: NominatimHit) => {
    skipNextSearchRef.current = true;
    setLocationName(hit.label);
    setLat(hit.lat.toFixed(4));
    setLng(hit.lon.toFixed(4));
    setSearchOpen(false);
    setSuggestions([]);
  };

  const useMyLocation = () => {
    if (geoState === 'pending') return;
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoState('error');
      setGeoError(t('export:hints.geoUnsupported'));
      return;
    }
    setGeoState('pending');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        skipNextSearchRef.current = true;
        setLat(la.toFixed(4));
        setLng(lo.toFixed(4));
        try {
          const hit = await reverseLookup(la, lo, {
            language: i18n.resolvedLanguage ?? i18n.language,
          });
          if (hit?.label) {
            skipNextSearchRef.current = true;
            setLocationName(hit.label);
          }
        } catch (err) {
          console.warn('[ExportDialog] reverse lookup failed', err);
        } finally {
          setGeoState('idle');
          setSearchOpen(false);
        }
      },
      (err) => {
        setGeoState('error');
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? t('export:hints.geoDenied')
            : t('export:hints.geoFailed'),
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  };

  // Feature-detect WebCodecs once per dialog open. Held in state (rather than
  // probed on click) so the button's label/icon can stay stable and the check
  // doesn't visibly delay the first click.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void isVideoExportSupported().then((ok) => {
      if (!cancelled) setVideoSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Cancel any in-flight video render if the dialog closes.
  useEffect(() => {
    if (!open && videoAbortRef.current) {
      videoAbortRef.current.abort();
      videoAbortRef.current = null;
    }
  }, [open]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavingError(null);
    try {
      const href = await composeAnnotatedWithStrip(
        imageSrc,
        scene,
        layers,
        meta,
        detailsFilters,
        includeStrip,
      );
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `stellaris-${Date.now()}.png`;
      anchor.click();
      onExported(href, meta);
    } catch (err) {
      console.error('[ExportDialog] save failed', err);
      setSavingError(t('export:hints.exportFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVideo = async () => {
    if (saving) return;
    setSaving(true);
    setSavingError(null);
    setVideoPct(0);
    const controller = new AbortController();
    videoAbortRef.current = controller;
    try {
      const { blobUrl } = await exportAnnotatedVideo({
        imageSrc,
        scene,
        layers,
        meta,
        filters: detailsFilters,
        includeStrip,
        onProgress: (p) => setVideoPct(p),
        signal: controller.signal,
      });
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `stellaris-${Date.now()}.mp4`;
      anchor.click();
      // Reuse the same post-export flow as the PNG path — parent opens the
      // share dialog and takes ownership of the blob URL lifetime.
      onExported(blobUrl, meta);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[ExportDialog] video export failed', err);
      setSavingError(
        err instanceof WebCodecsUnsupportedError
          ? t('export:hints.videoUnsupported')
          : t('export:hints.videoFailed'),
      );
    } finally {
      setSaving(false);
      setVideoPct(0);
      videoAbortRef.current = null;
    }
  };

  const fieldSummary = useMemo(() => {
    const fw = result.solve.field_width_deg;
    const fh = result.solve.field_height_deg;
    return `${fw.toFixed(1)}° × ${fh.toFixed(1)}°`;
  }, [result.solve.field_width_deg, result.solve.field_height_deg]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-[color:var(--color-ink-0)]/80 backdrop-blur-xl"
            onClick={saving ? undefined : onClose}
          />
          <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <motion.div
              ref={(node) => {
                dialogRef.current = node;
              }}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="surface relative w-full max-w-[920px] rounded-[var(--radius-xl)] outline-none shadow-[var(--shadow-lift)]"
            >
              <IconButton
                label={t('common:actions.close')}
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
                className="absolute top-3 right-3 z-10"
              >
                <X />
              </IconButton>

              <div className="px-4 sm:px-7 pt-5 sm:pt-7 pb-4 sm:pb-6 flex flex-col gap-4 sm:gap-5">
                <header className="flex flex-col gap-1.5 pr-10">
                  <span className="text-eyebrow">{t('export:eyebrow')}</span>
                  <h2 className="text-display text-[21px] sm:text-[24px] tracking-tight text-[color:var(--color-text)] leading-tight">
                    {t('export:title')}
                  </h2>
                  <p className="text-[12.5px] text-[color:var(--color-text-muted)] leading-relaxed">
                    {t('export:description', { field: fieldSummary })}
                  </p>
                </header>

                <div className="flex flex-col gap-3 min-h-0">
                  <div
                    className={cn(
                      'relative mx-auto w-full overflow-hidden',
                      'shadow-[var(--shadow-lift)]',
                      // Preview vertical cap. Smaller on mobile so the form + actions
                      // below can breathe; goes back to the roomier 52vh on sm+.
                      '[--preview-cap-h:36vh] sm:[--preview-cap-h:52vh]',
                    )}
                    style={{
                      aspectRatio: `${imgW} / ${imgH + (includeStrip ? stripH : 0)}`,
                      // Cap the width so the height (derived from aspect-ratio) can
                      // never exceed the target max — otherwise max-height alone
                      // squashes the box and the nested aspect-ratio children
                      // overflow behind `overflow-hidden`, cropping the photo.
                      maxWidth: `calc(var(--preview-cap-h) * ${(imgW / (imgH + (includeStrip ? stripH : 0))).toFixed(4)})`,
                      maxHeight: 'var(--preview-cap-h)',
                    }}
                  >
                    <div
                      className="relative w-full overflow-hidden"
                      style={{ aspectRatio: `${imgW} / ${imgH}` }}
                    >
                      {/* Soft atmospheric backdrop — same photo, heavily blurred,
                          so any letterbox bands caused by object-contain feel
                          like part of the frame instead of empty black. */}
                      <div aria-hidden className="absolute inset-0 overflow-hidden">
                        <img
                          src={imageSrc}
                          alt=""
                          aria-hidden
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover scale-110 opacity-75 select-none"
                          style={{ filter: 'blur(36px) saturate(1.15)' }}
                        />
                        <div className="absolute inset-0 bg-[color:var(--color-ink-0)]/35" />
                      </div>
                      <img
                        src={imageSrc}
                        alt={t('export:previewAlt')}
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain select-none"
                      />
                      <OverlayCanvas scene={scene} layers={layers} animate={false} />
                    </div>
                    {includeStrip && (
                      <div
                        className="relative w-full [&>svg]:block [&>svg]:w-full [&>svg]:h-full"
                        style={{ aspectRatio: `${imgW} / ${stripH}` }}
                        dangerouslySetInnerHTML={{ __html: stripMarkup }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)]',
                      'bg-[color:var(--color-ink-0)]/40 border border-[color:var(--color-line-soft)]',
                    )}
                  >
                    <Switch
                      checked={includeStrip}
                      onChange={setIncludeStrip}
                      label={t('export:strip.label')}
                      description={t('export:strip.description')}
                      disabled={saving}
                    />
                  </div>

                  {includeStrip && (
                  <>
                  <div className="relative" ref={locationWrapRef}>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-eyebrow">{t('export:location.header')}</span>
                      <div
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-1.5 h-10',
                          'rounded-[var(--radius-sm)] bg-[color:var(--color-ink-0)]/60',
                          'border border-[color:var(--color-line-soft)]',
                          'transition-colors duration-200',
                          'focus-within:border-[color:var(--color-star)]/60',
                          'focus-within:bg-[color:var(--color-ink-0)]/90',
                        )}
                      >
                        <span className="text-[color:var(--color-text-muted)] shrink-0">
                          {searching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                          ) : suggestions.length > 0 && searchOpen ? (
                            <Search className="h-3.5 w-3.5" strokeWidth={2.2} />
                          ) : (
                            <MapPin className="h-3.5 w-3.5" strokeWidth={2.2} />
                          )}
                        </span>
                        <input
                          type="text"
                          value={locationName}
                          onChange={(e) => {
                            setLocationName(e.target.value);
                            setSearchOpen(true);
                          }}
                          onFocus={() => {
                            if (locationName.trim().length >= 2) setSearchOpen(true);
                          }}
                          maxLength={80}
                          placeholder={t('export:location.placeholder')}
                          className={cn(
                            'flex-1 min-w-0 bg-transparent',
                            'outline-none focus:outline-none focus-visible:outline-none',
                            'text-[13px] text-[color:var(--color-text)]',
                            'placeholder:text-[color:var(--color-text-faint)]',
                          )}
                        />
                        <IconButton
                          label={geoState === 'pending' ? t('export:location.locating') : t('export:location.useCurrent')}
                          variant="ghost"
                          size="sm"
                          onClick={useMyLocation}
                          disabled={geoState === 'pending'}
                          className={cn(
                            'shrink-0',
                            geoState === 'error' && 'text-[color:var(--color-danger)]',
                          )}
                        >
                          {geoState === 'pending' ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <LocateFixed />
                          )}
                        </IconButton>
                      </div>
                    </label>

                    <AnimatePresence>
                      {searchOpen && (searching || suggestions.length > 0) && (
                        <motion.div
                          key="suggest"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                          className={cn(
                            'absolute left-0 right-0 top-full z-20 mt-1.5',
                            'surface rounded-[var(--radius-sm)] overflow-hidden',
                            'shadow-[var(--shadow-lift)]',
                          )}
                          role="listbox"
                        >
                          {searching && suggestions.length === 0 ? (
                            <div className="px-3 py-2.5 text-[12px] text-[color:var(--color-text-muted)]">
                              {t('export:location.searching')}
                            </div>
                          ) : (
                            <ul className="max-h-64 overflow-y-auto">
                              {suggestions.map((hit, i) => (
                                <li key={`${hit.lat}-${hit.lon}-${i}`}>
                                  <button
                                    type="button"
                                    role="option"
                                    onClick={() => pickSuggestion(hit)}
                                    className={cn(
                                      'w-full text-left px-3 py-2 flex flex-col gap-0.5',
                                      'hover:bg-[color:var(--color-ink-2)]/60',
                                      'transition-colors duration-150',
                                      i > 0 && 'border-t border-[color:var(--color-line-soft)]/50',
                                    )}
                                  >
                                    <span className="text-[12.5px] text-[color:var(--color-text)] truncate">
                                      {hit.label}
                                    </span>
                                    <span className="text-[11px] text-[color:var(--color-text-muted)] truncate">
                                      {hit.detail}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput
                      label={t('export:coordinates.latitude')}
                      icon={<Navigation className="h-3.5 w-3.5 -rotate-45" strokeWidth={2.2} />}
                      value={lat}
                      onChange={setLat}
                      placeholder="39.9042"
                      inputMode="decimal"
                      maxLength={16}
                    />
                    <FieldInput
                      label={t('export:coordinates.longitude')}
                      icon={<Navigation className="h-3.5 w-3.5 rotate-45" strokeWidth={2.2} />}
                      value={lng}
                      onChange={setLng}
                      placeholder="116.4074"
                      inputMode="decimal"
                      maxLength={16}
                    />
                  </div>
                  </>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pt-1">
                  <span className="text-[11.5px] text-[color:var(--color-text-muted)] min-h-[16px] leading-snug">
                    {savingError ? (
                      <span className="text-[color:var(--color-danger)]">{savingError}</span>
                    ) : geoError ? (
                      <span className="text-[color:var(--color-danger)]">{geoError}</span>
                    ) : (
                      t('export:hints.default')
                    )}
                  </span>
                  {/* Mobile: buttons stretch with flex-1 so the video button's
                      progress label (which widens the pill mid-render) can't
                      push the primary save off-screen. sm+: shrink to content
                      and right-align as before. */}
                  <div className="flex items-center justify-end gap-2 sm:shrink-0">
                    {/* Cancel hidden on mobile — the top-right X already dismisses, keeping
                        thumb focus on the primary Save (and optional Save video) CTA. */}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={onClose}
                      disabled={saving}
                      className="hidden sm:inline-flex"
                    >
                      {t('export:buttons.cancel')}
                    </Button>
                    {videoSupported && (
                      <Button
                        variant="subtle"
                        size="md"
                        onClick={handleSaveVideo}
                        disabled={saving}
                        className="flex-1 sm:flex-none"
                        leading={
                          saving && videoPct > 0 ? (
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                          ) : (
                            <Film className="h-4 w-4" strokeWidth={2.2} />
                          )
                        }
                      >
                        {saving && videoPct > 0 ? (
                          <>
                            <span className="hidden sm:inline">
                              {t('export:buttons.savingVideo', { pct: Math.round(videoPct * 100) })}
                            </span>
                            <span className="sm:hidden">
                              {t('export:buttons.savingVideoShort', { pct: Math.round(videoPct * 100) })}
                            </span>
                          </>
                        ) : (
                          t('export:buttons.saveVideo')
                        )}
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 sm:flex-none"
                      leading={
                        saving && videoPct === 0 ? (
                          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                        ) : (
                          <Download className="h-4 w-4" strokeWidth={2.2} />
                        )
                      }
                    >
                      {saving && videoPct === 0
                        ? t('export:buttons.saving')
                        : t('export:buttons.save')}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface FieldInputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
}

function FieldInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
}: FieldInputProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">{label}</span>
      <div
        className={cn(
          'flex items-center gap-2 px-3 h-10',
          'rounded-[var(--radius-sm)] bg-[color:var(--color-ink-0)]/60',
          'border border-[color:var(--color-line-soft)]',
          'transition-colors duration-200',
          'focus-within:border-[color:var(--color-star)]/60',
          'focus-within:bg-[color:var(--color-ink-0)]/90',
        )}
      >
        <span className="text-[color:var(--color-text-muted)] shrink-0">{icon}</span>
        <input
          type="text"
          value={value}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'flex-1 min-w-0 bg-transparent',
            'outline-none focus:outline-none focus-visible:outline-none',
            'text-[13px] text-[color:var(--color-text)]',
            'placeholder:text-[color:var(--color-text-faint)]',
          )}
        />
      </div>
    </label>
  );
}
