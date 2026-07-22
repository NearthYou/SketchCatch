import type { SelectedAssistantOption } from "./selected-option-model";
import styles from "./workspace-ai.module.css";

export function SelectedOptionTrail({
  compact = false,
  selections
}: {
  readonly compact?: boolean | undefined;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const content = (
    <div className={styles.selectionTrailBody}>
      {selections.length === 0 ? (
        <p className={styles.selectionTrailEmpty}>선택한 답변 없음</p>
      ) : (
        <ol className={styles.selectionTrailList}>
          {selections.map((selection) => (
            <li className={styles.selectionTrailItem} key={selection.id}>
              <span aria-hidden="true" className={styles.selectionTrailOrder}>
                {String(selection.order).padStart(2, "0")}
              </span>
              <span>{selection.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  if (compact) {
    return (
      <details className={styles.selectionTrailCompact}>
        <summary>선택한 답변 보기</summary>
        {content}
      </details>
    );
  }

  return (
    <section aria-labelledby="selected-option-trail-heading" className={styles.selectionTrail}>
      <div className={styles.selectionTrailHeader}>
        <h2 id="selected-option-trail-heading">선택한 답변</h2>
      </div>
      {content}
    </section>
  );
}
