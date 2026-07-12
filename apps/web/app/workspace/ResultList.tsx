type ResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

type ResultGroup = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly ResultItem[];
};

type ResultListProps = {
  readonly items: readonly ResultItem[];
  readonly summary: string;
};

// 같은 label을 가진 분석 항목을 한 섹션으로 모아 반복 제목을 줄입니다.
export function createResultGroups(items: readonly ResultItem[]): ResultGroup[] {
  return items.reduce<ResultGroup[]>((groups, item) => {
    const groupIndex = groups.findIndex((group) => group.label === item.label);

    if (groupIndex === -1) {
      return [...groups, { id: item.id, label: item.label, items: [item] }];
    }

    return groups.map((group, index) =>
      index === groupIndex ? { ...group, items: [...group.items, item] } : group
    );
  }, []);
}

// finding이나 Terraform 감지 결과처럼 요약과 항목 목록이 있는 응답을 같은 모양으로 보여줍니다.
export function ResultList({ items, summary }: ResultListProps) {
  const groups = createResultGroups(items);

  return (
    <div className="resultStack">
      <p className="resultTitle">{summary}</p>
      <ul className="resultList">
        {groups.map((group) => (
          <li key={group.id}>
            <strong>{group.label}</strong>
            {group.items.length === 1 ? (
              <span>{group.items[0]?.text}</span>
            ) : (
              <ul className="resultListItems">
                {group.items.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
