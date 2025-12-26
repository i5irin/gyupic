import { useEffect, useState } from 'react';
import styles from './SettingsPanel.module.css';

type Props = {
  currentJpegQuality: number;
  onApply: (jpegQuality: number) => void;
};

export default function SettingsPanel({ currentJpegQuality, onApply }: Props) {
  const [draftQuality, setDraftQuality] = useState(currentJpegQuality);

  useEffect(() => {
    setDraftQuality(currentJpegQuality);
  }, [currentJpegQuality]);

  const isDirty = draftQuality !== currentJpegQuality;

  return (
    <section className={styles.settingsPanel} aria-label="Settings">
      <div className={styles.settingsPanelHeader}>
        <h2 className={styles.settingsPanelTitle}>Settings</h2>
      </div>

      <div className={styles.settingsPanelBody}>
        <div className={styles.settingsPanelRow}>
          <div className={styles.settingsPanelLabel}>
            JPEG Quality: <strong>{Math.round(draftQuality * 100)}%</strong>
          </div>
        </div>

        <div className={styles.settingsPanelActions}>
          <button
            type="button"
            className={styles.settingsPanelApplyButton}
            onClick={() => onApply(draftQuality)}
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
