import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Eye, EyeOff, RefreshCw } from 'lucide-react';
import {
  useCelestialTranslation,
  useTranslation,
} from '@/i18n/useTranslation';
import { useSky } from '@/state/store';
import type { StripMeta } from '@/lib/composite';
import { buildScene } from '@/lib/scene';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { ImageViewer } from './ImageViewer';
import { OverlayCanvas } from './OverlayCanvas';
import { ResultDetailsSheet } from './ResultDetailsSheet';
import { ExportDialog } from './ExportDialog';
import { ShareDialog } from './ShareDialog';

export function ResultView() {
  const { t } = useTranslation(['result', 'app']);
  const result = useSky((s) => s.result);
  const current = useSky((s) => s.current);
  const options = useSky((s) => s.options);
  const labelLocale = useSky((s) => s.locale);
  const reset = useSky((s) => s.reset);
  const [showOriginalState, setShowOriginalState] = useState<{
    sourceKey: string | null;
    value: boolean;
  }>({ sourceKey: null, value: false });
  const [fullscreen, setFullscreen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMeta, setShareMeta] = useState<StripMeta | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const labelT = useCelestialTranslation(labelLocale);
  const showOriginal = showOriginalState.sourceKey === current?.sourceKey
    ? showOriginalState.value
    : false;

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  // Celestial labels are driven by the label locale (store.locale) so users
  // can pick a different language for star/DSO names than the UI. Changing the
  // label locale — whether by switching UI language (useLocaleSync mirrors it
  // into the store) or via the LabelLocaleSwitcher — rebuilds the scene with
  // fresh translations. No re-POST to /api/analyze: client-side only.
  const catalog = result?.catalog;
  const scene = useMemo(() => {
    if (!catalog || !catalog.image_width) return null;
    return buildScene(catalog, options, labelT);
  }, [catalog, options, labelT]);

  // Keyed to the result so a fresh analysis (or history restore) remounts the
  // overlay and replays entrance animations + the breathing glow filters.
  // Layer toggles don't change the key — they just re-run the memo.
  const overlayKey = result
    ? `${result.processingMs}-${result.solve.center_ra_deg.toFixed(2)}-${result.solve.center_dec_deg.toFixed(2)}`
    : 'none';

  const overlay = useMemo(() => {
    if (!scene) return null;
    return <OverlayCanvas key={overlayKey} scene={scene} layers={options.layers} animate />;
  }, [scene, options.layers, overlayKey]);

  useEffect(() => {
    return () => {
      if (exportedUrl && exportedUrl.startsWith('blob:')) URL.revokeObjectURL(exportedUrl);
    };
  }, [exportedUrl]);

  if (!result || !current) return null;

  const activeSrc = current.inputDisplayUrl;
  const activeAlt = showOriginal ? t('altOriginal') : t('altAnnotated');
  const activeOverlay = !showOriginal ? overlay : null;
  // Keyed to the result only — NOT to showOriginal — so toggling the overlay keeps
  // the viewer's zoom/pan state instead of remounting the image underneath.
  const resultKey = current.sourceKey;

  const openExport = () => {
    if (!scene) return;
    setExportOpen(true);
  };

  const toggleShowOriginal = () => {
    setShowOriginalState({
      sourceKey: current.sourceKey,
      value: !showOriginal,
    });
  };

  const handleExported = (href: string, meta: StripMeta) => {
    // The browser already grabbed the download via the anchor tag. We hold
    // onto the blob URL so it can be revoked when the share flow closes.
    setExportedUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return href;
    });
    setShareMeta(meta);
    setExportOpen(false);
    setShareOpen(true);
  };

  const actionButtons = (
    <>
      <Button
        variant="subtle"
        size="sm"
        leading={
          showOriginal ? (
            <Eye className="h-3.5 w-3.5" strokeWidth={2.2} />
          ) : (
            <EyeOff className="h-3.5 w-3.5" strokeWidth={2.2} />
          )
        }
        onClick={toggleShowOriginal}
      >
        {showOriginal ? t('toggleAnnotated') : t('toggleOriginal')}
      </Button>
      <Button
        variant="subtle"
        size="sm"
        leading={<Download className="h-3.5 w-3.5" strokeWidth={2.2} />}
        onClick={openExport}
        disabled={!scene}
      >
        {t('export')}
      </Button>
      <div className="surface rounded-full p-0.5">
        <IconButton
          label={t('app:topbar.restart')}
          variant="ghost"
          size="sm"
          onClick={reset}
        >
          <RefreshCw />
        </IconButton>
      </div>
    </>
  );

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full w-full sm:p-2.5"
    >
      {!fullscreen && (
        <>
          <ImageViewer
            key={resultKey}
            src={activeSrc}
            alt={activeAlt}
            cacheKey={resultKey}
            twinkle={false}
            enhance={!!activeOverlay}
            bottomOffset={72}
            reservedBottom={66}
            topRight={actionButtons}
            overlay={activeOverlay}
            onToggleFullscreen={() => setFullscreen(true)}
          />
          <ResultDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} />
        </>
      )}

      <AnimatePresence>
        {fullscreen && (
          <motion.div
            key="fs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[60] bg-[color:var(--color-ink-0)]/85 backdrop-blur-2xl"
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full w-full p-3"
            >
              <ImageViewer
                key={`fs::${resultKey}`}
                src={activeSrc}
                alt={activeAlt}
                cacheKey={`fs::${resultKey}`}
                twinkle={false}
                enhance={!!activeOverlay}
                bottomOffset={72}
                reservedBottom={66}
                topRight={actionButtons}
                overlay={activeOverlay}
                fullscreen
                onToggleFullscreen={() => setFullscreen(false)}
              />
              <ResultDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {scene && exportOpen && (
        <ExportDialog
          open
          onClose={() => setExportOpen(false)}
          onExported={handleExported}
          imageSrc={current.inputDisplayUrl}
          scene={scene}
          layers={options.layers}
          result={result}
        />
      )}
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        meta={shareMeta}
      />
    </motion.div>
  );
}
