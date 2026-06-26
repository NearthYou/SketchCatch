type ResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

type ResultListProps = {
  readonly items: readonly ResultItem[];
  readonly summary: string;
};

// finding이나 Terraform 감지 결과처럼 요약과 항목 목록이 있는 응답을 같은 모양으로 보여줍니다.
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
