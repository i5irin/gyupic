import { LoadedThumbnail } from './types';
import styles from './LoadedList.module.css';

type Props = {
  items: LoadedThumbnail[];
};

export default function LoadedList({ items }: Props) {
  return (
    <div className={styles.loadImageList}>
      {items.map((t) => (
        <div key={t.key} className={styles.loadImageListItem}>
          <img
            alt="loaded thumbnail"
            className={styles.loadImageListItemImage}
            src={t.url}
            onLoad={() => {
              try {
                t.file.revokeObjectURL();
              } catch {
                // noop
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
