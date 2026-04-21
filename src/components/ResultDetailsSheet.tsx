import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Focus,
  Stars,
  Telescope,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  detailsCategoryActive,
  detailsFiltersActive,
  useSky,
  type DetailsCategory,
} from '@/state/store';
import { Stat } from './ui/Stat';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'stars', category: 'stars', icon: Stars },
  { id: 'constellations', category: 'constellations', icon: Compass },
  { id: 'dso', category: 'dsos', icon: Telescope },
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

interface RowItem {
  id: string;
  filterKey: string;
  primary: string;
  secondary: string;
  meta: string;
}

export function ResultDetailsSheet({ open, onOpenChange }: ResultDetailsSheetProps) {
  const { t } = useTranslation(['result', 'catalog']);
  const result = useSky((s) => s.result);
  const filters = useSky((s) => s.detailsFilters);
  const toggleItemHidden = useSky((s) => s.toggleItemHidden);
  const toggleItemSolo = useSky((s) => s.toggleItemSolo);
  const clearCategoryFilters = useSky((s) => s.clearCategoryFilters);
  const clearAllFilters = useSky((s) => s.clearAllFilters);
  const [tab, setTab] = useState<TabId>('stars');

  if (!result) return null;

  const counts = {
    stars: result.visible_named_stars.length,
    constellations: result.visible_constellations.length,
    dso: result.visible_deep_sky_objects.length,
  };

  // filterKey must match the string used in OverlayCanvas to join scene items
  // to result items — which is the display `name`.
  const items: RowItem[] = (() => {
    switch (tab) {
      case 'stars':
        return result.visible_named_stars.map((s) => ({
          id: s.id,
          filterKey: s.name,
          primary: s.name,
          secondary: s.constellation ?? '',
          meta: `mag ${s.magnitude.toFixed(2)}`,
        }));
      case 'constellations':
        return result.visible_constellations.map((c) => ({
          id: c.id,
          // Filter key is the IAU abbr (c.id) so hide/solo state is i18n-stable
          // and joins precisely against scene.constellation_figures[].id and
          // constellation labels' `.constellation` field.
          filterKey: c.id,
          primary: c.name,
          secondary: '',
          meta: t('result:details.mainStarsCount', { count: c.starCount }),
        }));
      case 'dso':
        return result.visible_deep_sky_objects.map((d) => ({
          id: d.id,
          filterKey: d.name,
          primary: d.name,
          // d.type is a raw backend code (e.g. "OCl"); translate via catalog with fallback to raw.
          secondary: t(`catalog:dsoTypes.${d.type}`, { defaultValue: d.type }),
          meta: `mag ${d.magnitude.toFixed(1)}`,
        }));
    }
  })();

  const currentCategory: DetailsCategory = TABS.find((tabDef) => tabDef.id === tab)!.category;
  const categoryState = (() => {
    switch (currentCategory) {
      case 'stars':
        return { hidden: filters.starsHidden, solo: filters.starSolo };
      case 'constellations':
        return { hidden: filters.constellationsHidden, solo: filters.constellationSolo };
      case 'dsos':
        return { hidden: filters.dsosHidden, solo: filters.dsoSolo };
    }
  })();

  const hiddenCount = categoryState.hidden.size;
  const categoryHasFilter = detailsCategoryActive(filters, currentCategory);
  const anyFilter = detailsFiltersActive(filters);

  const soloItemName = categoryState.solo
    ? items.find((i) => i.filterKey === categoryState.solo)?.primary ?? categoryState.solo
    : null;

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
          {anyFilter && open && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearAllFilters();
              }}
              className="text-[11px] text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)] transition-colors px-2 py-0.5 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-star)]/60"
            >
              {t('result:filterBar.resetAll')}
            </button>
          )}
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
        <div className="flex items-center gap-1 pt-3 shrink-0 min-w-0">
          {TABS.map((tabDef) => {
            const active = tab === tabDef.id;
            const Icon = tabDef.icon;
            const tabFilterActive = detailsCategoryActive(filters, tabDef.category);
            return (
              <button
                key={tabDef.id}
                type="button"
                onClick={() => setTab(tabDef.id)}
                tabIndex={open ? 0 : -1}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] transition-colors relative',
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
                {tabFilterActive && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[color:var(--color-star)]"
                  />
                )}
              </button>
            );
          })}
          <AnimatePresence initial={false}>
            {categoryHasFilter && (
              <motion.div
                key={`cat-filter-${currentCategory}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="ml-auto flex items-center gap-2 min-w-0 pl-2"
              >
                <span className="text-[11px] text-[color:var(--color-text-soft)] truncate max-w-[140px] sm:max-w-[220px]">
                  {soloItemName
                    ? t('result:filterBar.soloing', { name: soloItemName })
                    : t('result:filterBar.someHidden', { count: hiddenCount })}
                </span>
                <button
                  type="button"
                  onClick={() => clearCategoryFilters(currentCategory)}
                  tabIndex={open ? 0 : -1}
                  className="text-[11px] text-[color:var(--color-text-soft)] hover:text-[color:var(--color-text)] transition-colors shrink-0 px-1.5 py-0.5 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-star)]/60"
                >
                  {t('result:filterBar.clearTab')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
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
              {items.map((item) => {
                const isHidden = categoryState.hidden.has(item.filterKey);
                const isSolo = categoryState.solo === item.filterKey;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'group/row relative flex items-center justify-between gap-2 py-1 pl-1.5 pr-1',
                      'border-b border-[color:var(--color-line-soft)]/50 last:border-b-0',
                      'transition-opacity duration-200',
                      isHidden && 'opacity-50',
                      isSolo &&
                        'before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-[color:var(--color-star)]',
                    )}
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
                    <div className="relative shrink-0 flex items-center justify-end min-w-[52px]">
                      {/* Meta drives layout width on desktop; fades out as actions fade in.
                          Both sides use opacity on the same slot so there's no display-swap pop. */}
                      <span
                        className={cn(
                          'text-mono text-[10.5px] text-[color:var(--color-text-soft)] tabular-nums',
                          'hidden sm:inline-block transition-opacity duration-150',
                          'sm:group-hover/row:opacity-0 sm:focus-within:opacity-0',
                          (isHidden || isSolo) && 'sm:opacity-0',
                        )}
                        aria-hidden={isHidden || isSolo ? 'true' : undefined}
                      >
                        {item.meta}
                      </span>
                      <div
                        className={cn(
                          'absolute inset-y-0 right-0 flex items-center gap-0.5 transition-opacity duration-150',
                          // Mobile: always visible (meta is hidden there). Desktop: reveals on hover/focus.
                          'opacity-100 sm:opacity-0 sm:pointer-events-none',
                          'sm:group-hover/row:opacity-100 sm:group-hover/row:pointer-events-auto',
                          'sm:focus-within:opacity-100 sm:focus-within:pointer-events-auto',
                          (isHidden || isSolo) && 'sm:opacity-100 sm:pointer-events-auto',
                        )}
                      >
                        <button
                          type="button"
                          aria-label={isSolo ? t('result:actions.unsolo') : t('result:actions.solo')}
                          aria-pressed={isSolo}
                          title={isSolo ? t('result:actions.unsolo') : t('result:actions.solo')}
                          onClick={() => toggleItemSolo(currentCategory, item.filterKey)}
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-full',
                            'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-2)]/60',
                            'transition-colors',
                            isSolo && 'text-[color:var(--color-star)] hover:text-[color:var(--color-star)]',
                          )}
                        >
                          <Focus className="h-3.5 w-3.5" strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          aria-label={isHidden ? t('result:actions.show') : t('result:actions.hide')}
                          aria-pressed={isHidden}
                          title={isHidden ? t('result:actions.show') : t('result:actions.hide')}
                          onClick={() => toggleItemHidden(currentCategory, item.filterKey)}
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-full',
                            'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-2)]/60',
                            'transition-colors',
                          )}
                        >
                          {isHidden ? (
                            <EyeOff className="h-3.5 w-3.5" strokeWidth={2.2} />
                          ) : (
                            <Eye className="h-3.5 w-3.5" strokeWidth={2.2} />
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
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
