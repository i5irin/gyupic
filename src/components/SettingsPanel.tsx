import { useEffect, useMemo, useState } from 'react';
import styles from './SettingsPanel.module.css';

type Props = {
  currentJpegQuality: number;
  onApply: (jpegQuality: number) => void;
};

export default function SettingsPanel({ currentJpegQuality, onApply }: Props) {
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

  return (
    <section className={styles.settingsPanel} aria-label="Settings">
      <div className={styles.settingsPanelHeader}>
        <h2 className={styles.settingsPanelTitle}>Settings</h2>
      </div>

      <div className={styles.settingsPanelBody}>
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
