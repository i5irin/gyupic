import { useEffect, useMemo, useState } from 'react';
import styles from './SettingsPanel.module.css';

type DeliveryOption = {
  id: string;
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
};

type PresetOption = {
  id: string;
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
};

type Props = {
  currentJpegQuality: number;
  presetId: string;
  presetOptions: PresetOption[];
  onChangePreset: (id: string) => void;
  pickupInfo?: { title: string; description: string };
  deliveryInfo?: DeliveryOption;
  onApply: (jpegQuality: number) => void;
};

export default function SettingsPanel({
  currentJpegQuality,
  presetId,
  presetOptions,
  onChangePreset,
  pickupInfo,
  deliveryInfo,
  onApply,
}: Props) {
  const MIN = 0.1;
  const MAX = 1.0;
  const STEP = 0.05;

  const normalize = (v: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, v));
    const stepped = Math.round(clamped / STEP) * STEP;
    // avoid 0.30000000000004 style floats
    return Number(stepped.toFixed(2));
  };

  const [draftQuality, setDraftQuality] = useState(() =>
    normalize(currentJpegQuality),
  );

  useEffect(() => {
    setDraftQuality(normalize(currentJpegQuality));
  }, [currentJpegQuality]);

  const isDirty = useMemo(
    () => normalize(draftQuality) !== normalize(currentJpegQuality),
    [draftQuality, currentJpegQuality],
  );

  const selectedPreset = useMemo(
    () => presetOptions.find((option) => option.id === presetId),
    [presetId, presetOptions],
  );

  const deliveryBadgeClass = (guarantee: DeliveryOption['guarantee']) => {
    switch (guarantee) {
      case 'best-effort':
        return styles.settingsPanelBadgeBestEffort;
      case 'unverified':
        return styles.settingsPanelBadgeUnverified;
      case 'guaranteed':
      default:
        return styles.settingsPanelBadgeGuaranteed;
    }
  };

  const deliveryBadgeLabel = (guarantee: DeliveryOption['guarantee']) => {
    switch (guarantee) {
      case 'best-effort':
        return 'Best effort';
      case 'unverified':
        return 'Unverified';
      case 'guaranteed':
      default:
        return 'Guaranteed';
    }
  };

  return (
    <section className={styles.settingsPanel} aria-label="Settings">
      <div className={styles.settingsPanelHeader}>
        <h2 className={styles.settingsPanelTitle}>Settings</h2>
      </div>

      <div className={styles.settingsPanelBody}>
        {presetOptions.length > 0 && (
          <div className={styles.settingsPanelRow}>
            <label className={styles.settingsPanelLabel} htmlFor="presetSelect">
              Preset
              <select
                id="presetSelect"
                className={styles.settingsPanelSelect}
                value={presetId}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (next !== presetId) {
                    onChangePreset(next);
                  }
                }}
              >
                {presetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedPreset && (
              <div className={styles.settingsPanelScenarioDescription}>
                <span>{selectedPreset.description}</span>
                <span
                  className={`${styles.settingsPanelBadge} ${deliveryBadgeClass(
                    selectedPreset.guarantee,
                  )}`}
                >
                  {deliveryBadgeLabel(selectedPreset.guarantee)}
                </span>
              </div>
            )}
          </div>
        )}

        {pickupInfo && (
          <div className={styles.settingsPanelRow}>
            <div className={styles.settingsPanelLabel}>Pickup Source</div>
            <div className={styles.settingsPanelScenarioDescription}>
              <strong>{pickupInfo.title}</strong>
              <span>{pickupInfo.description}</span>
            </div>
          </div>
        )}

        {deliveryInfo && (
          <div className={styles.settingsPanelRow}>
            <div className={styles.settingsPanelLabel}>Delivery Path</div>
            <div className={styles.settingsPanelScenarioDescription}>
              <strong>{deliveryInfo.title}</strong>
              <span>{deliveryInfo.description}</span>
              <span
                className={`${styles.settingsPanelBadge} ${deliveryBadgeClass(
                  deliveryInfo.guarantee,
                )}`}
              >
                {deliveryBadgeLabel(deliveryInfo.guarantee)}
              </span>
            </div>
          </div>
        )}

        <div className={styles.settingsPanelRow}>
          <label className={styles.settingsPanelLabel} htmlFor="jpegQuality">
            JPEG Quality: <strong>{Math.round(draftQuality * 100)}%</strong>
          </label>

          <input
            id="jpegQuality"
            className={styles.settingsPanelRange}
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={draftQuality}
            onChange={(e) => {
              setDraftQuality(normalize(Number(e.currentTarget.value)));
            }}
          />

          <div className={styles.settingsPanelNote}>
            Changes apply to queued/processing items. Completed items are not
            auto-reconverted.
          </div>
        </div>

        <div className={styles.settingsPanelActions}>
          <button
            type="button"
            className={styles.settingsPanelApplyButton}
            onClick={() => onApply(normalize(draftQuality))}
            disabled={!isDirty}
          >
            Apply
          </button>
          <span className={styles.settingsPanelHint}>
            {isDirty ? 'Not applied' : 'Applied'}
          </span>
        </div>
      </div>
    </section>
  );
}

SettingsPanel.defaultProps = {
  pickupInfo: undefined,
  deliveryInfo: undefined,
};
