import { useEffect, useMemo, useState } from 'react';
import type {
  FilenameStrategy,
  OutputFormat,
  TimestampWriteMode,
} from '../domain/presets';
import styles from './SettingsPanel.module.css';

type PresetOption = {
  id: string;
  title: string;
  story: string;
  usage: string[];
  category: 'stable' | 'experimental';
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

type ActivePresetInfo = {
  story: string;
  usage: string[];
  environmentHints?: string[];
};

type Props = {
  currentJpegQuality: number;
  currentOutputFormat: OutputFormat;
  currentFilenameStrategy: FilenameStrategy;
  currentTimestampMode: TimestampWriteMode;
  rewriteExif: boolean;
  injectFromEditedTime: boolean;
  presetId: string;
  presetOptions: PresetOption[];
  activePreset?: ActivePresetInfo;
  onChangePreset: (id: string) => void;
  onApply: (settings: {
    jpegQuality: number;
    outputFormat: OutputFormat;
    filenameStrategy: FilenameStrategy;
    timestampWriteMode: TimestampWriteMode;
    rewriteExif: boolean;
    injectFromEditedTime: boolean;
  }) => void;
};

export default function SettingsPanel({
  currentJpegQuality,
  currentOutputFormat,
  currentFilenameStrategy,
  currentTimestampMode,
  rewriteExif,
  injectFromEditedTime,
  presetId,
  presetOptions,
  activePreset,
  onChangePreset,
  onApply,
}: Props) {
  const MIN = 0.1;
  const MAX = 1.0;
  const STEP = 0.05;

  const normalize = (v: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, v));
    const stepped = Math.round(clamped / STEP) * STEP;
    return Number(stepped.toFixed(2));
  };

  const [draftQuality, setDraftQuality] = useState(() =>
    normalize(currentJpegQuality),
  );
  const [draftOutputFormat, setDraftOutputFormat] =
    useState<OutputFormat>(currentOutputFormat);
  const [draftFilenameStrategy, setDraftFilenameStrategy] =
    useState<FilenameStrategy>(currentFilenameStrategy);
  const [draftTimestampMode, setDraftTimestampMode] =
    useState<TimestampWriteMode>(currentTimestampMode);
  const [draftRewriteExif, setDraftRewriteExif] =
    useState<boolean>(rewriteExif);
  const [draftInjectEdited, setDraftInjectEdited] =
    useState<boolean>(injectFromEditedTime);

  useEffect(() => {
    setDraftQuality(normalize(currentJpegQuality));
  }, [currentJpegQuality]);

  useEffect(() => {
    setDraftOutputFormat(currentOutputFormat);
  }, [currentOutputFormat]);

  useEffect(() => {
    setDraftFilenameStrategy(currentFilenameStrategy);
  }, [currentFilenameStrategy]);

  useEffect(() => {
    setDraftTimestampMode(currentTimestampMode);
  }, [currentTimestampMode]);

  useEffect(() => {
    setDraftRewriteExif(rewriteExif);
  }, [rewriteExif]);

  useEffect(() => {
    setDraftInjectEdited(injectFromEditedTime);
  }, [injectFromEditedTime]);

  const isDirty = useMemo(
    () =>
      normalize(draftQuality) !== normalize(currentJpegQuality) ||
      draftOutputFormat !== currentOutputFormat ||
      draftFilenameStrategy !== currentFilenameStrategy ||
      draftTimestampMode !== currentTimestampMode ||
      draftRewriteExif !== rewriteExif ||
      draftInjectEdited !== injectFromEditedTime,
    [
      draftQuality,
      currentJpegQuality,
      draftOutputFormat,
      currentOutputFormat,
      draftFilenameStrategy,
      currentFilenameStrategy,
      draftTimestampMode,
      currentTimestampMode,
      draftRewriteExif,
      rewriteExif,
      draftInjectEdited,
      injectFromEditedTime,
    ],
  );

  const selectedPreset = useMemo(
    () => presetOptions.find((option) => option.id === presetId),
    [presetId, presetOptions],
  );

  const outputFormatOptions: { value: OutputFormat; label: string }[] = [
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF' },
  ];

  const filenameStrategyOptions: { value: FilenameStrategy; label: string }[] =
    [
      { value: 'keep-original', label: 'Keep original names' },
      { value: 'timestamped', label: 'Add YYYYMMDD_HHmmss prefix' },
    ];

  const timestampModeOptions: { value: TimestampWriteMode; label: string }[] = [
    { value: 'copy-exif', label: 'Copy Exif capture time' },
    { value: 'from-file-modified', label: 'Use edited/file time' },
    { value: 'off', label: 'Do not rewrite timestamps' },
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
                    {option.recommended ? ' (Recommended)' : ''}
                    {option.disabled ? ' (Unavailable)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedPreset && (
              <div className={styles.settingsPanelScenarioDescription}>
                <span>{selectedPreset.story}</span>
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

        {activePreset?.usage && activePreset.usage.length > 0 && (
          <div className={styles.settingsPanelRow}>
            <div className={styles.settingsPanelLabel}>Use cases</div>
            <div className={styles.settingsPanelScenarioDescription}>
              <ul className={styles.settingsPanelUsageList}>
                {activePreset.usage.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {activePreset.environmentHints && (
                <div className={styles.settingsPanelHintBlock}>
                  {activePreset.environmentHints.map((hint) => (
                    <div key={hint}>{hint}</div>
                  ))}
                </div>
              )}
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
          <label
            className={styles.settingsPanelLabel}
            htmlFor="filenameStrategy"
          >
            Filename Strategy
            <select
              id="filenameStrategy"
              className={styles.settingsPanelSelect}
              value={draftFilenameStrategy}
              onChange={(e) =>
                setDraftFilenameStrategy(
                  e.currentTarget.value as FilenameStrategy,
                )
              }
            >
              {filenameStrategyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.settingsPanelNote}>
            `timestamped` adds `YYYYMMDD_HHmmss_` to filenames to help Finder /
            Files sort by name.
          </div>
        </div>

        <div className={styles.settingsPanelRow}>
          <label className={styles.settingsPanelLabel} htmlFor="timestampMode">
            Timestamp Source
            <select
              id="timestampMode"
              className={styles.settingsPanelSelect}
              value={draftTimestampMode}
              onChange={(e) =>
                setDraftTimestampMode(
                  e.currentTarget.value as TimestampWriteMode,
                )
              }
            >
              {timestampModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.settingsPanelRow}>
          <div className={styles.settingsPanelLabel}>Advanced Options</div>
          <div className={styles.settingsPanelAdvancedToggles}>
            <label
              className={styles.settingsPanelCheckboxLabel}
              htmlFor="rewriteExifTimestamps"
            >
              <input
                id="rewriteExifTimestamps"
                type="checkbox"
                checked={draftRewriteExif}
                onChange={(e) => setDraftRewriteExif(e.currentTarget.checked)}
              />
              Rewrite Exif timestamps
            </label>
            <label
              className={styles.settingsPanelCheckboxLabel}
              htmlFor="editedFileTimeFallback"
            >
              <input
                id="editedFileTimeFallback"
                type="checkbox"
                checked={draftInjectEdited}
                onChange={(e) => setDraftInjectEdited(e.currentTarget.checked)}
              />
              Allow edited/file time fallback
            </label>
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
                filenameStrategy: draftFilenameStrategy,
                timestampWriteMode: draftTimestampMode,
                rewriteExif: draftRewriteExif,
                injectFromEditedTime: draftInjectEdited,
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
  activePreset: undefined,
};
