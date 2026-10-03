import { useEffect, useMemo, useState } from 'react';
import type { FilenameSource, OutputFormat } from '../domain/presets';
import styles from './SettingsPanel.module.css';

type DeliveryInfo = {
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
};

type PresetOption = {
  id: string;
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
  category: 'stable' | 'experimental';
  disabled?: boolean;
  disabledReason?: string;
};

type Props = {
  currentJpegQuality: number;
  currentOutputFormat: OutputFormat;
  currentFilenameSource: FilenameSource;
  presetId: string;
  presetOptions: PresetOption[];
  onChangePreset: (id: string) => void;
  pickupInfo?: { title: string; description: string };
  deliveryInfo?: DeliveryInfo;
  onApply: (settings: {
    jpegQuality: number;
    outputFormat: OutputFormat;
    filenameSource: FilenameSource;
  }) => void;
};

export default function SettingsPanel({
  currentJpegQuality,
  currentOutputFormat,
  currentFilenameSource,
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
  const [draftOutputFormat, setDraftOutputFormat] =
    useState<OutputFormat>(currentOutputFormat);
  const [draftFilenameSource, setDraftFilenameSource] =
    useState<FilenameSource>(currentFilenameSource);

  useEffect(() => {
    setDraftQuality(normalize(currentJpegQuality));
  }, [currentJpegQuality]);

  useEffect(() => {
    setDraftOutputFormat(currentOutputFormat);
  }, [currentOutputFormat]);

  useEffect(() => {
    setDraftFilenameSource(currentFilenameSource);
  }, [currentFilenameSource]);

  const isDirty = useMemo(
    () =>
      normalize(draftQuality) !== normalize(currentJpegQuality) ||
      draftOutputFormat !== currentOutputFormat ||
      draftFilenameSource !== currentFilenameSource,
    [
      draftQuality,
      currentJpegQuality,
      draftOutputFormat,
      currentOutputFormat,
      draftFilenameSource,
      currentFilenameSource,
    ],
  );

  const selectedPreset = useMemo(
    () => presetOptions.find((option) => option.id === presetId),
    [presetId, presetOptions],
  );

  const deliveryBadgeClass = (guarantee: DeliveryInfo['guarantee']) => {
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

  const deliveryBadgeLabel = (guarantee: DeliveryInfo['guarantee']) => {
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

  const outputFormatOptions: { value: OutputFormat; label: string }[] = [
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF' },
  ];

  const filenameSourceOptions: { value: FilenameSource; label: string }[] = [
    { value: 'original', label: 'Keep original name' },
    { value: 'exif', label: 'Exif capture time' },
    { value: 'file-last-modified', label: 'File modified time' },
  ];

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
                  <option
                    key={option.id}
                    value={option.id}
                    disabled={option.disabled}
                  >
                    {option.title}
                    {option.disabled ? ' (Unavailable)' : ''}
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
                {selectedPreset.category === 'experimental' && (
                  <span
                    className={`${styles.settingsPanelBadge} ${styles.settingsPanelBadgeExperimental}`}
                  >
                    Experimental
                  </span>
                )}
                {selectedPreset.disabled && selectedPreset.disabledReason && (
                  <div className={styles.settingsPanelWarning}>
                    {selectedPreset.disabledReason}
                  </div>
                )}
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

        <div className={styles.settingsPanelRow}>
          <label className={styles.settingsPanelLabel} htmlFor="outputFormat">
            Output Format
            <select
              id="outputFormat"
              className={styles.settingsPanelSelect}
              value={draftOutputFormat}
              onChange={(e) =>
                setDraftOutputFormat(e.currentTarget.value as OutputFormat)
              }
            >
              {outputFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.settingsPanelRow}>
          <label className={styles.settingsPanelLabel} htmlFor="filenameSource">
            Filename Timestamp
            <select
              id="filenameSource"
              className={styles.settingsPanelSelect}
              value={draftFilenameSource}
              onChange={(e) =>
                setDraftFilenameSource(e.currentTarget.value as FilenameSource)
              }
            >
              {filenameSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.settingsPanelNote}>
            Filenames adopt the selected timestamp; failures fall back to the
            original name with a warning.
          </div>
        </div>

        <div className={styles.settingsPanelActions}>
          <button
            type="button"
            className={styles.settingsPanelApplyButton}
            onClick={() =>
              onApply({
                jpegQuality: normalize(draftQuality),
                outputFormat: draftOutputFormat,
                filenameSource: draftFilenameSource,
              })
            }
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
