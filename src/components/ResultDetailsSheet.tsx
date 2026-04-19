import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Stars, Compass, Telescope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { Stat } from './ui/Stat';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'stars', icon: Stars },
  { id: 'constellations', icon: Compass },
  { id: 'dso', icon: Telescope },
] as const;

type TabId = (typeof TABS)[number]['id'];

const COLLAPSED_HEIGHT = 52;
const EXPANDED_HEIGHT = 360;

interface ResultDetailsSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function formatRa(deg: number): string {
  const hours = (deg / 15 + 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
}

function formatDec(deg: number): string {
  const sign = deg >= 0 ? '+' : '−';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  return `${sign}${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}′`;
}

export function ResultDetailsSheet({ open, onOpenChange }: ResultDetailsSheetProps) {
  const { t } = useTranslation(['result', 'catalog']);
  const result = useSky((s) => s.result);
  const [tab, setTab] = useState<TabId>('stars');

  if (!result) return null;

  const counts = {
    stars: result.visible_named_stars.length,
    constellations: result.visible_constellations.length,
    dso: result.visible_deep_sky_objects.length,
  };

  const items = (() => {
    switch (tab) {
      case 'stars':
        return result.visible_named_stars.map((s) => ({
          id: s.id,
          primary: s.name,
          secondary: s.constellation ?? '',
          meta: `mag ${s.magnitude.toFixed(2)}`,
        }));
      case 'constellations':
        return result.visible_constellations.map((c) => ({
          id: c.id,
          primary: c.name,
          secondary: '',
          meta: t('result:details.mainStarsCount', { count: c.starCount }),
        }));
      case 'dso':
        return result.visible_deep_sky_objects.map((d) => ({
          id: d.id,
          primary: d.name,
          // d.type is a raw backend code (e.g. "OCl"); translate via catalog with fallback to raw.
          secondary: t(`catalog:dsoTypes.${d.type}`, { defaultValue: d.type }),
          meta: `mag ${d.magnitude.toFixed(1)}`,
        }));
    }
  })();

  return (
    <motion.div
      initial={false}
      animate={{ height: open ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.6 }}
      className="absolute inset-x-2.5 bottom-2.5 z-20 surface rounded-[var(--radius-lg)] overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100% - 20px)' }}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="result-details-content"
        className="flex items-center justify-between gap-3 px-3.5 h-[52px] shrink-0 hover:bg-[color:var(--color-ink-2)]/40 transition-colors"
      >
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="text-eyebrow shrink-0">{t('result:details.header')}</span>
          <div className="flex items-center gap-2.5 sm:gap-3 text-[12px] text-[color:var(--color-text-soft)]">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Stars className="h-3 w-3 shrink-0 text-[color:var(--color-star)]" strokeWidth={2.2} />
              {counts.stars}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Compass className="h-3 w-3 shrink-0 text-[color:var(--color-aurora)]" strokeWidth={2.2} />
              {counts.constellations}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Telescope className="h-3 w-3 shrink-0 text-[color:var(--color-nebula)]" strokeWidth={2.2} />
              {counts.dso}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden sm:inline text-mono text-[10.5px] text-[color:var(--color-text-muted)] tabular-nums">
            {(result.processingMs / 1000).toFixed(2)}s
          </span>
          <ChevronUp
            className={cn(
              'h-4 w-4 shrink-0 text-[color:var(--color-text-soft)] transition-transform duration-300',
              open ? 'rotate-180' : 'rotate-0',
            )}
            strokeWidth={2.2}
          />
        </div>
      </button>

      <div
        id="result-details-content"
        aria-hidden={!open}
        className={cn(
          'flex-1 min-h-0 flex flex-col gap-3 px-3.5 pb-3.5 border-t border-[color:var(--color-line-soft)]/60',
          'transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="flex items-center gap-1 pt-3 shrink-0">
          {TABS.map((tabDef) => {
            const active = tab === tabDef.id;
            const Icon = tabDef.icon;
            return (
              <button
                key={tabDef.id}
                type="button"
                onClick={() => setTab(tabDef.id)}
                tabIndex={open ? 0 : -1}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] transition-colors',
                  active
                    ? 'bg-[color:var(--color-ink-2)] text-[color:var(--color-text)]'
                    : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-soft)]',
                )}
              >
                <Icon className="h-3 w-3" strokeWidth={2.2} />
                {t(`result:details.tabs.${tabDef.id}`)}
                <span className="text-mono text-[10.5px] text-[color:var(--color-text-faint)] ml-0.5 tabular-nums">
                  {counts[tabDef.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-3.5 px-3.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1.5"
            >
              {items.length === 0 && (
                <li className="col-span-full text-[12px] text-[color:var(--color-text-muted)] py-2">
                  {t('result:details.empty')}
                </li>
              )}
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-2 py-1 border-b border-[color:var(--color-line-soft)]/50 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-[color:var(--color-text)] truncate">
                      {item.primary}
                    </div>
                    {item.secondary && (
                      <div className="text-[10.5px] text-[color:var(--color-text-muted)] truncate">
                        {item.secondary}
                      </div>
                    )}
                  </div>
                  <span className="text-mono text-[10.5px] text-[color:var(--color-text-soft)] shrink-0 tabular-nums">
                    {item.meta}
                  </span>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[color:var(--color-line-soft)]/60 shrink-0">
          <Stat
            label={t('result:details.stats.fieldCenter')}
            value={formatRa(result.solve.center_ra_deg)}
            hint={formatDec(result.solve.center_dec_deg)}
          />
          <Stat
            label={t('result:details.stats.fieldSize')}
            value={`${result.solve.field_width_deg.toFixed(1)}°`}
            hint={`× ${result.solve.field_height_deg.toFixed(1)}°`}
          />
          <Stat
            label={t('result:details.stats.elapsed')}
            value={`${(result.processingMs / 1000).toFixed(2)}s`}
          />
        </div>
      </div>
    </motion.div>
  );
}
