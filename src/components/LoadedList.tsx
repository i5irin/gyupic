import styles from './LoadedList.module.css';

type Props = {
  items: { id: string; url: string }[];
};

export default function LoadedList({ items }: Props) {
  return (
    <div className={styles.loadImageList}>
      {items.map((t) => (
        <div key={t.id} className={styles.loadImageListItem}>
          <img
            alt="loaded thumbnail"
            className={styles.loadImageListItemImage}
            src={t.url}
          />
        </div>
      ))}
    </div>
  );
}
