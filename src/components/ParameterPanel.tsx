import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { LABEL_LOCALES } from '@/data/defaults';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import { Switch } from './ui/Switch';
import { Slider } from './ui/Slider';
import type { Locale, OverlayOptions, Preset } from '@/types/api';

type LayerKey = keyof OverlayOptions['layers'];

interface LayerGroup {
  titleKey: 'constellation' | 'stars' | 'deepSky';
  layers: LayerKey[];
  /** When a child's parent layer is off the child is hidden and implicitly disabled. */
  dependsOn?: Partial<Record<LayerKey, LayerKey>>;
}

const LAYER_GROUPS: LayerGroup[] = [
  { titleKey: 'constellation', layers: ['constellation_lines', 'constellation_labels'] },
  { titleKey: 'stars', layers: ['star_markers', 'star_labels'] },
  {
    titleKey: 'deepSky',
    layers: ['deep_sky_markers', 'deep_sky_labels', 'label_leaders'],
    dependsOn: { deep_sky_labels: 'deep_sky_markers' },
  },
];

export function ParameterPanel() {
  const { t } = useTranslation(['parameters', 'common']);
  const options = useSky((s) => s.options);
  const locale = useSky((s) => s.locale);
  const phase = useSky((s) => s.phase);
  const current = useSky((s) => s.current);
  const resultLocale = useSky((s) => s.resultLocale);
  const applyPreset = useSky((s) => s.applyPreset);
  const toggleLayer = useSky((s) => s.toggleLayer);
  const updateDetail = useSky((s) => s.updateDetail);
  const setLocale = useSky((s) => s.setLocale);
  const startAnalysis = useSky((s) => s.startAnalysis);

  const canReanalyze = phase === 'result' && !!current && current.blob.size > 0 && !!resultLocale;
  const localeDrifted = !!resultLocale && locale !== resultLocale;

  return (
    <div className="flex flex-col gap-5 pr-1">
      <section className="flex flex-col gap-2.5">
        <header className="flex items-baseline justify-between">
          <span className="text-eyebrow">{t('parameters:presets.header')}</span>
          <span className="text-[10.5px] text-[color:var(--color-text-faint)]">
            {t(`parameters:presets.${options.preset}.hint`)}
          </span>
        </header>
        <SegmentedControl<Preset>
          ariaLabel={t('parameters:presets.ariaLabel')}
          value={options.preset}
          onChange={applyPreset}
          options={[
            { value: 'balanced', label: t('parameters:presets.balanced.label') },
            { value: 'detailed', label: t('parameters:presets.detailed.label') },
            { value: 'max', label: t('parameters:presets.max.label') },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <header className="flex items-baseline justify-between">
          <span className="text-eyebrow">{t('common:language.uiLabel')}</span>
        </header>
        <LanguageSwitcher />
      </section>

      <section className="flex flex-col gap-2.5">
        <header className="flex items-baseline justify-between">
          <span className="text-eyebrow">{t('parameters:labelLocale.header')}</span>
          {localeDrifted && (
            <span className="text-[10.5px] text-[color:var(--color-text-faint)]">
              {t('parameters:labelLocale.driftHint')}
            </span>
          )}
        </header>
        <div className="relative">
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            aria-label={t('parameters:labelLocale.ariaLabel')}
            className="w-full appearance-none rounded-full bg-[color:var(--color-ink-2)]/80 border border-[color:var(--color-line-soft)] px-3.5 py-2 pr-9 text-[12.5px] text-[color:var(--color-text)] hover:bg-[color:var(--color-ink-3)]/50 transition-colors"
          >
            {LABEL_LOCALES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--color-text-muted)]"
          >
            ▾
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <header className="text-eyebrow">{t('parameters:layers.header')}</header>
        <div className="flex flex-col gap-3">
          {LAYER_GROUPS.map((group) => (
            <div key={group.titleKey} className="flex flex-col gap-0.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-faint)] mb-0.5">
                {t(`parameters:layers.groups.${group.titleKey}`)}
              </span>
              {group.layers.map((layer) => {
                const parent = group.dependsOn?.[layer];
                if (parent && !options.layers[parent]) return null;
                return (
                  <Switch
                    key={layer}
                    label={t(`parameters:layers.items.${layer}`)}
                    checked={options.layers[layer]}
                    onChange={() => toggleLayer(layer)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <header className="text-eyebrow">{t('parameters:detail.header')}</header>
        <Slider
          label={t('parameters:detail.starLimit')}
          value={options.detail.star_label_limit}
          min={0}
          max={96}
          step={1}
          onChange={(value) => updateDetail('star_label_limit', value)}
        />
        <Slider
          label={t('parameters:detail.starMagnitude')}
          value={options.detail.star_magnitude_limit}
          min={1}
          max={7}
          step={0.1}
          format={(value) => `≤ ${value.toFixed(1)} mag`}
          onChange={(value) => updateDetail('star_magnitude_limit', value)}
        />
        <Slider
          label={t('parameters:detail.dsoLimit')}
          value={options.detail.dso_label_limit}
          min={0}
          max={96}
          step={1}
          onChange={(value) => updateDetail('dso_label_limit', value)}
        />
        <Slider
          label={t('parameters:detail.dsoMagnitude')}
          value={options.detail.dso_magnitude_limit}
          min={5}
          max={13}
          step={0.1}
          format={(value) => `≤ ${value.toFixed(1)} mag`}
          onChange={(value) => updateDetail('dso_magnitude_limit', value)}
        />
        <div className="flex flex-col gap-0.5 mt-1">
          <Switch
            label={t('parameters:layers.items.contextual_constellation_labels')}
            checked={options.layers.contextual_constellation_labels}
            onChange={() => toggleLayer('contextual_constellation_labels')}
          />
          <Switch
            label={t('parameters:detail.showAllConstellations')}
            checked={options.detail.show_all_constellation_labels}
            onChange={(value) => updateDetail('show_all_constellation_labels', value)}
          />
          <Switch
            label={t('parameters:detail.detailedDsoLabels')}
            checked={options.detail.detailed_dso_labels}
            onChange={(value) => updateDetail('detailed_dso_labels', value)}
          />
        </div>
        <p className="text-[10.5px] leading-[1.5] text-[color:var(--color-text-faint)] mt-1">
          {t('parameters:detail.live')}
        </p>
      </section>

      {canReanalyze && localeDrifted && (
        <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-line-soft)] bg-[color:var(--color-ink-2)]/40 p-3">
          <span className="text-[11.5px] text-[color:var(--color-text-soft)]">
            {t('parameters:reanalyze.message')}
          </span>
          <Button
            variant="primary"
            size="sm"
            leading={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />}
            onClick={() => void startAnalysis()}
          >
            {t('parameters:reanalyze.button')}
          </Button>
        </section>
      )}
    </div>
  );
}
