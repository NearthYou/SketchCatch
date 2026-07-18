import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";
import { createArchitectureBoardCompilationPreview } from "./architecture-board-compilation-preview";
import styles from "./architecture-board-compilation-summary.module.css";

export function ArchitectureBoardCompilationSummary({
  proposal
}: {
  readonly proposal: ArchitectureBoardCompilationProposal;
}) {
  const preview = createArchitectureBoardCompilationPreview(proposal);

  return (
    <section aria-label="배치 컴파일러 결과" className={styles.summary}>
      <div className={styles.heading}>
        <span>배치 정리 결과</span>
        <strong>{preview.outcome.headline}</strong>
        <p>{preview.outcome.reviewSummary}</p>
      </div>

      {preview.outcome.items.length > 0 ? (
        <ul className={styles.outcomes}>
          {preview.outcome.items.map((item) => (
            <li data-tone={item.tone} key={item.key}>
              <span>{item.label}</span>
              <strong>{item.summary}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyOutcome}>추적 지표에서 표시할 배치 문제가 없습니다.</p>
      )}

      <div className={styles.detailGrid}>
        <SummaryDetail
          emptyLabel="변경 없음"
          items={preview.changeGroups.map(({ count, label }) => `${label} ${count}`)}
          label="변경"
        />
        <SummaryDetail
          emptyLabel="진단 없음"
          items={preview.diagnosticGroups.map(({ count, label }) => `${label} ${count}`)}
          label="확인"
        />
      </div>

      <details className={styles.technical}>
        <summary>기술 세부 정보</summary>
        <div className={styles.technicalBody}>
          <dl className={styles.metrics}>
            <div>
              <dt>내부 cost (낮을수록 우선)</dt>
              <dd>
                {formatScore(preview.quality.beforeScore)} →{" "}
                {formatScore(preview.quality.afterScore)}
              </dd>
            </div>
            <div>
              <dt>변경 cost</dt>
              <dd>{formatScore(preview.quality.compilationDistance)}</dd>
            </div>
          </dl>
          <SummaryDetail emptyLabel="일반 규칙" items={preview.referenceTemplateIds} label="참고" />
          <p>후보: {preview.candidateId}</p>
          <p>Compiler: {preview.compilerVersion}</p>
          {preview.diagnosticSummaries.length > 0 ? (
            <p>
              진단: {preview.diagnosticSummaries.slice(0, 2).join(" · ")}
              {preview.diagnosticSummaries.length > 2
                ? ` 외 ${preview.diagnosticSummaries.length - 2}`
                : ""}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function SummaryDetail({
  emptyLabel,
  items,
  label
}: {
  readonly emptyLabel: string;
  readonly items: readonly string[];
  readonly label: string;
}) {
  return (
    <div className={styles.detail}>
      <span>{label}</span>
      <strong>{items.length === 0 ? emptyLabel : items.join(" · ")}</strong>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
