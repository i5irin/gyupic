import { ConvertedThumbnail } from './types';

type Props = {
  items: ConvertedThumbnail[];
};

export default function ConvertedList({ items }: Props) {
  return (
    <div>
      {items.map((t) => (
        <div key={t.key}>
          <img
            alt="converted thumbnail"
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
