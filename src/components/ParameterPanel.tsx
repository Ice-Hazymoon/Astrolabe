import { useTranslation } from 'react-i18next';
import { useSky } from '@/state/store';
import { SegmentedControl } from './ui/SegmentedControl';
import { Switch } from './ui/Switch';
import { Slider } from './ui/Slider';
import type { OverlayOptions, Preset } from '@/types/api';

type LayerKey = keyof OverlayOptions['layers'];

interface LayerGroup {
  titleKey: 'constellation' | 'stars' | 'deepSky';
  layers: LayerKey[];
  /** When a child's parent layer is off the child is hidden and implicitly disabled. */
  dependsOn?: Partial<Record<LayerKey, LayerKey>>;
}

const LAYER_GROUPS: LayerGroup[] = [
  { titleKey: 'constellation', layers: ['constellation_lines', 'constellation_labels'] },
  {
    titleKey: 'stars',
    layers: ['star_markers', 'star_labels'],
    dependsOn: { star_labels: 'star_markers' },
  },
  {
    titleKey: 'deepSky',
    layers: ['deep_sky_markers', 'deep_sky_labels', 'label_leaders'],
    dependsOn: { deep_sky_labels: 'deep_sky_markers' },
  },
];

export function ParameterPanel() {
  const { t } = useTranslation('parameters');
  const options = useSky((s) => s.options);
  const applyPreset = useSky((s) => s.applyPreset);
  const toggleLayer = useSky((s) => s.toggleLayer);
  const updateDetail = useSky((s) => s.updateDetail);

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
    </div>
  );
}
