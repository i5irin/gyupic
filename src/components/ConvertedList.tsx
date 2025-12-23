type Props = {
  items: { id: string; url: string }[];
};

export default function ConvertedList({ items }: Props) {
  return (
    <div>
      {items.map((t) => (
        <div key={t.id}>
          <img alt="converted thumbnail" src={t.url} />
        </div>
      ))}
    </div>
  );
}
