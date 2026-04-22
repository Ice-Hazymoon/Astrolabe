import { useCallback, useRef, useState, type DragEvent } from 'react';
import { ImageUp, Sparkles } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useSky } from '@/state/store';
import { Button } from './ui/Button';
import { cn } from '@/lib/cn';

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function UploadZone() {
  const { t } = useTranslation('upload');
  const acceptFile = useSky((s) => s.acceptFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError(t('errors.unsupportedType'));
        return;
      }
      setError(null);
      await acceptFile(file);
    },
    [acceptFile, t],
  );

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(true);
  };
  const onDragLeave = () => setOver(false);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const loadSample = async () => {
    setError(null);
    const response = await fetch('/samples/input.jpg');
    const blob = await response.blob();
    const file = new File([blob], 'sample-input.jpg', { type: blob.type || 'image/jpeg' });
    await handleFile(file);
  };

  return (
    <div className="relative h-full w-full flex items-stretch justify-center p-4 sm:p-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-5 sm:gap-6',
          'rounded-[var(--radius-xl)] w-full max-w-[680px] mx-auto',
          'min-h-[280px] sm:min-h-[360px] py-10 px-6 sm:py-14 sm:px-10',
          'border border-dashed transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'cursor-pointer overflow-hidden',
          over
            ? 'border-[color:var(--color-star)]/60 bg-[color:var(--color-star)]/[0.04] scale-[1.005]'
            : 'border-[color:var(--color-line)] bg-[color:var(--color-ink-1)]/40 hover:bg-[color:var(--color-ink-1)]/70 hover:border-[color:var(--color-line)]/90',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        {/* Ambient warm glow that pulses on hover */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10',
            'bg-[radial-gradient(circle_at_50%_42%,oklch(0.86_0.13_78/0.08),transparent_60%)]',
            'opacity-60 group-hover:opacity-100 transition-opacity duration-500',
          )}
        />

        <div className="relative shrink-0">
          <div className="absolute inset-0 -m-5 rounded-full bg-[color:var(--color-star)]/10 blur-2xl" />
          <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--color-ink-2)] border border-[color:var(--color-line-soft)]">
            <ImageUp className="h-6 w-6 text-[color:var(--color-star)]" strokeWidth={1.6} />
          </span>
        </div>

        <div className="text-center max-w-[440px]">
          <h2 className="text-display text-[22px] sm:text-[26px] leading-tight text-[color:var(--color-text)]">
            {t('title')}
          </h2>
          <p className="mt-2 text-[12.5px] sm:text-[13px] text-[color:var(--color-text-muted)] leading-relaxed">
            {t('description')}
            <br className="hidden sm:inline" />
            <span className="sm:hidden"> </span>
            {t('descriptionSecondLine')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="md"
            leading={<ImageUp className="h-4 w-4" strokeWidth={2.2} />}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            {t('buttons.choose')}
          </Button>
          <Button
            variant="subtle"
            size="md"
            leading={<Sparkles className="h-4 w-4" strokeWidth={2.2} />}
            onClick={(event) => {
              event.stopPropagation();
              void loadSample();
            }}
          >
            {t('buttons.sample')}
          </Button>
        </div>

        {error && (
          <p
            aria-live="polite"
            className="text-[12px] text-[color:var(--color-danger)] absolute bottom-4 left-4 right-4 text-center"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
