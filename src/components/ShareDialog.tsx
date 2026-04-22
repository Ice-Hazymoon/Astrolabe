import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { IconButton } from './ui/IconButton';
import { Logo } from './ui/Logo';
import { XGlyph } from './ui/XGlyph';
import { cn } from '@/lib/cn';
import { SITE_URL, resolveOrigin } from '@/lib/config';
import type { StripMeta } from '@/lib/composite';

const CREATOR_URL = 'https://z.tools';
const CREATOR_NAME = 'z.tools';
const FOLLOW_URL = 'https://x.com/GetZTools';

interface ShareDialogProps {
  open: boolean;
  onClose(): void;
  /** Location metadata used in the just-saved image — becomes the default share caption. */
  meta: StripMeta | null;
}

export function ShareDialog({ open, onClose, meta }: ShareDialogProps) {
  const { t } = useTranslation(['share', 'common', 'app']);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    if (prev instanceof HTMLElement) restoreFocusRef.current = prev;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  // Prefer the live browser origin (so staging deploys self-link), falling back
  // to the build-time config and finally the canonical production URL.
  const siteUrl = resolveOrigin() || SITE_URL;

  const caption = meta?.locationName
    ? t('share:captionWithLocation', { location: meta.locationName })
    : t('share:captionDefault');

  const shares: ShareTarget[] = [
    {
      id: 'x',
      label: t('share:targets.x'),
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(siteUrl)}`,
      icon: <XGlyph className="h-[18px] w-[18px]" />,
    },
    {
      id: 'threads',
      label: t('share:targets.threads'),
      href: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${caption} — ${siteUrl}`)}`,
      icon: <ThreadsBrand />,
    },
    {
      id: 'facebook',
      label: t('share:targets.facebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}&quote=${encodeURIComponent(caption)}`,
      icon: <FacebookBrand />,
    },
    {
      id: 'linkedin',
      label: t('share:targets.linkedin'),
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(siteUrl)}`,
      icon: <LinkedInBrand />,
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" aria-modal="true" role="dialog">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-[color:var(--color-ink-0)]/75 backdrop-blur-xl"
            onClick={onClose}
          />
          <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <motion.div
              ref={(node) => {
                dialogRef.current = node;
              }}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="surface relative w-full max-w-[460px] rounded-[var(--radius-xl)] outline-none shadow-[var(--shadow-lift)]"
            >
              <IconButton
                label={t('common:actions.close')}
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="absolute top-3 right-3 z-10"
              >
                <X />
              </IconButton>

              <div className="px-5 sm:px-8 pt-7 sm:pt-10 pb-5 sm:pb-6 flex flex-col gap-4 sm:gap-6">
                <header className="flex flex-col items-center gap-2 sm:gap-2.5 text-center">
                  <span className="relative inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center">
                    <Logo className="h-full w-full text-[color:var(--color-star)]" />
                    <span
                      aria-hidden
                      className="absolute inset-0 blur-xl bg-[color:var(--color-star)]/25 -z-10"
                    />
                  </span>
                  <h2 className="text-display text-[22px] sm:text-[26px] tracking-tight text-[color:var(--color-text)] leading-tight">
                    {t('app:brand')}
                  </h2>
                  <p className="text-[13px] text-[color:var(--color-text-muted)] leading-relaxed max-w-[320px]">
                    {t('share:description')}
                  </p>
                </header>

                <div className="flex flex-col gap-2">
                  {shares.map((s) => (
                    <ShareRow key={s.id} {...s} />
                  ))}
                </div>

                <a
                  href={FOLLOW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('share:follow.title')}
                  className={cn(
                    'group self-center inline-flex items-center gap-2 rounded-full pl-3.5 pr-3 h-9',
                    'border border-[color:var(--color-line-soft)] bg-[color:var(--color-star)]/[0.05]',
                    'transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    'hover:bg-[color:var(--color-star)]/[0.09] hover:border-[color:var(--color-line)]',
                    'active:scale-[0.995]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-star)]/60',
                  )}
                >
                  <XGlyph className="h-[13px] w-[13px] text-[color:var(--color-text)] shrink-0" />
                  <span className="text-[12.5px] font-medium text-[color:var(--color-text)] tracking-tight">
                    {t('share:follow.title')}
                  </span>
                  <span className="text-[11px] text-[color:var(--color-text-muted)] tracking-tight">
                    {t('common:social.xHandle')}
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-[color:var(--color-text-muted)] group-hover:text-[color:var(--color-text-soft)] shrink-0 transition-colors"
                    strokeWidth={2}
                  />
                </a>

                <footer className="pt-2 border-t border-[color:var(--color-line-soft)]/60 flex items-center justify-center gap-1.5 text-[11.5px] text-[color:var(--color-text-muted)]">
                  <span>{t('share:madeBy')}</span>
                  <span aria-hidden className="text-[color:var(--color-star)]">✦</span>
                  <a
                    href={CREATOR_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 decoration-[color:var(--color-line)] hover:text-[color:var(--color-text-soft)] transition-colors"
                  >
                    {CREATOR_NAME}
                  </a>
                </footer>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface ShareTarget {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

function ShareRow({ label, href, icon }: ShareTarget) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex items-center gap-3 px-4 h-[52px] rounded-full',
        'border border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-0)]/40',
        'transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:bg-[color:var(--color-ink-2)]/50 hover:border-[color:var(--color-line)]',
        'active:scale-[0.995]',
      )}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center text-[color:var(--color-text)] shrink-0">
        {icon}
      </span>
      <span className="text-[13.5px] font-medium text-[color:var(--color-text)] tracking-tight">
        {label}
      </span>
    </a>
  );
}

// --- Brand marks (minimal monochrome, tuned to pair with the lucide icon set)

function ThreadsBrand() {
  // Minimal approximation of the Threads "@-spiral" mark — we keep it mono-line
  // so it reads alongside the other two-tone brand glyphs.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M16.5 11.25c0-2.35-1.9-3.85-4.5-3.85-2.2 0-3.6 1.05-4.15 2.6" />
      <path d="M8 14.75c.7 1.55 2.1 2.55 4.05 2.55 2.4 0 4-1.2 4-2.85 0-1.9-1.9-2.5-4.4-2.9-2.15-.35-3.35-.9-3.35-2.15 0-1.1 1.05-1.9 2.8-1.9 1.6 0 2.7.7 2.95 1.85" />
      <path d="M12 3c-5 0-8 3.4-8 9s3 9 8 9c3.5 0 6.2-1.6 7.4-4.5" />
    </svg>
  );
}

function FacebookBrand() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[19px] w-[19px]">
      <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
    </svg>
  );
}

function LinkedInBrand() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" />
    </svg>
  );
}
