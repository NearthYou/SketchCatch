type ResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

type ResultListProps = {
  readonly items: readonly ResultItem[];
  readonly summary: string;
};

export function ResultList({ items, summary }: ResultListProps) {
  return (
    <div className="resultStack">
      <p className="resultTitle">{summary}</p>
      <ul className="resultList">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
