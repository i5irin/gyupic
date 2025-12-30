import { useEffect, useMemo, useState } from 'react';
import styles from './SettingsPanel.module.css';

type PickupOption = {
  id: string;
  title: string;
  description: string;
};

type DeliveryOption = {
  id: string;
  title: string;
  description: string;
  guarantee: 'guaranteed' | 'best-effort' | 'unverified';
};

type Props = {
  currentJpegQuality: number;
  pickupId: string;
  pickupOptions: PickupOption[];
  onChangePickup: (id: string) => void;
  deliveryId: string;
  deliveryOptions: DeliveryOption[];
  onChangeDelivery: (id: string) => void;
  onApply: (jpegQuality: number) => void;
};

export default function SettingsPanel({
  currentJpegQuality,
  pickupId,
  pickupOptions,
  onChangePickup,
  deliveryId,
  deliveryOptions,
  onChangeDelivery,
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

  const selectedPickup = useMemo(
    () => pickupOptions.find((option) => option.id === pickupId),
    [pickupId, pickupOptions],
  );

  const selectedDelivery = useMemo(
    () => deliveryOptions.find((option) => option.id === deliveryId),
    [deliveryId, deliveryOptions],
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
        {pickupOptions.length > 0 && (
          <div className={styles.settingsPanelRow}>
            <label className={styles.settingsPanelLabel} htmlFor="pickupPath">
              Pickup Source
              <select
                id="pickupPath"
                className={styles.settingsPanelSelect}
                value={pickupId}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (next !== pickupId) {
                    onChangePickup(next);
                  }
                }}
              >
                {pickupOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedPickup && (
              <div className={styles.settingsPanelScenarioDescription}>
                <span>{selectedPickup.description}</span>
              </div>
            )}
          </div>
        )}

        {deliveryOptions.length > 0 && (
          <div className={styles.settingsPanelRow}>
            <label
              className={styles.settingsPanelLabel}
              htmlFor="deliveryPath"
            >
              Delivery Path
              <select
                id="deliveryPath"
                className={styles.settingsPanelSelect}
                value={deliveryId}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (next !== deliveryId) {
                    onChangeDelivery(next);
                  }
                }}
              >
                {deliveryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedDelivery && (
              <div className={styles.settingsPanelScenarioDescription}>
                <span>{selectedDelivery.description}</span>
                <span
                  className={`${styles.settingsPanelBadge} ${deliveryBadgeClass(
                    selectedDelivery.guarantee,
                  )}`}
                >
                  {deliveryBadgeLabel(selectedDelivery.guarantee)}
                </span>
              </div>
            )}
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
