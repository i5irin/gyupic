import { useEffect, useRef } from 'react';
import styles from './ItemsGrid.module.css';
import type { GridItem } from '../state/selectors';

type Props = {
  items: GridItem[];
  onRetry?: (id: string) => void;
  onDownload?: (id: string) => void;
  onCancel?: (id: string) => void;
  scrollToId?: string;
};

function statusLabel(status: GridItem['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'done':
      return 'Done';
    case 'warning':
      return 'Warning';
    case 'error':
      return 'Error';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

function statusBadgeClass(status: GridItem['status']): string {
  switch (status) {
    case 'queued':
      return styles.badgeQueued;
    case 'processing':
      return styles.badgeProcessing;
    case 'done':
      return styles.badgeDone;
    case 'warning':
      return styles.badgeWarning;
    case 'error':
      return styles.badgeError;
    default:
      return styles.badgeQueued;
  }
}

export default function ItemsGrid({
  items,
  onRetry,
  onDownload,
  onCancel,
  scrollToId,
}: Props) {
  const targetElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollToId) {
      return;
    }
    const el = targetElRef.current;
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [scrollToId]);

  return (
    <div className={styles.grid}>
      {items.map((it) => (
        <div
          key={it.id}
          className={styles.tile}
          ref={it.id === scrollToId ? targetElRef : undefined}
        >
          <div className={styles.badges}>
            <span className={`${styles.badge} ${statusBadgeClass(it.status)}`}>
              {statusLabel(it.status)}
            </span>
            {it.isNew && (
              <span className={`${styles.badge} ${styles.badgeNew}`}>New</span>
            )}
          </div>

          <div className={styles.imageWrap}>
            <img
              className={styles.image}
              src={it.previewUrl}
              alt="preview"
              loading="lazy"
            />
          </div>

          <div className={styles.meta}>
            {it.status === 'error' && it.error && (
              <div className={styles.error} title={it.error}>
                {it.error}
              </div>
            )}
            {it.status === 'warning' && it.warningReason && (
              <div className={styles.warning} title={it.warningReason}>
                {it.warningReason}
              </div>
            )}

            {/* Action buttons for individual images, currently just a frame (handlers passed in) */}
            {(it.actions.canRetry ||
              it.actions.canDownload ||
              it.actions.canCancel) && (
              <div className={styles.actions}>
                {it.actions.canRetry && (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onRetry?.(it.id)}
                    disabled={!onRetry}
                  >
                    Retry
                  </button>
                )}
                {it.actions.canDownload && (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onDownload?.(it.id)}
                    disabled={!onDownload}
                  >
                    Download
                  </button>
                )}
                {it.actions.canCancel && (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => onCancel?.(it.id)}
                    disabled={!onCancel}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

ItemsGrid.defaultProps = {
  onRetry: undefined,
  onDownload: undefined,
  onCancel: undefined,
  scrollToId: undefined,
};
