import styles from './ItemsGrid.module.css';
import type { GridItem } from '../state/selectors';

type Props = {
  items: GridItem[];
  onRetry?: (id: string) => void;
  onDownload?: (id: string) => void;
  onCancel?: (id: string) => void;
};

function statusLabel(status: GridItem['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'done':
      return 'Done';
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
}: Props) {
  return (
    <div className={styles.grid}>
      {items.map((it) => (
        <div key={it.id} className={styles.tile}>
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
};
