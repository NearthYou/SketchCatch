import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";
import { createArchitectureBoardCompilationPreview } from "./architecture-board-compilation-preview";
import styles from "./architecture-board-compilation-summary.module.css";

export function ArchitectureBoardCompilationSummary({
  proposal
}: {
  readonly proposal: ArchitectureBoardCompilationProposal;
}) {
  const preview = createArchitectureBoardCompilationPreview(proposal);
  const changeCount = proposal.changes.length;
  const diagnosticCount = proposal.diagnostics.length;
  const scoreImproved = preview.quality.afterScore <= preview.quality.beforeScore;

  return (
    <section aria-label="Compiler 제안 요약" className={styles.summary}>
      <div className={styles.heading}>
        <span>LAYOUT COMPILER</span>
        <strong>{changeCount === 0 ? "현재 배치 유지" : `변경 ${changeCount}`}</strong>
      </div>

      <dl className={styles.metrics}>
        <div>
          <dt>정리 점수</dt>
          <dd data-improved={scoreImproved}>
            {formatScore(preview.quality.beforeScore)} → {formatScore(preview.quality.afterScore)}
          </dd>
        </div>
        <div>
          <dt>변경 거리</dt>
          <dd>{formatScore(preview.quality.compilationDistance)}</dd>
        </div>
        <div>
          <dt>진단</dt>
          <dd>{diagnosticCount}</dd>
        </div>
      </dl>

      <div className={styles.detailGrid}>
        <SummaryDetail
          emptyLabel="변경 없음"
          items={preview.changeGroups.map(({ count, label }) => `${label} ${count}`)}
          label="변경"
        />
        <SummaryDetail
          emptyLabel="진단 없음"
          items={preview.diagnosticGroups.map(({ count, label }) => `${label} ${count}`)}
          label="진단"
        />
        <SummaryDetail
          emptyLabel="일반 규칙"
          items={preview.referenceTemplateIds}
          label="근거"
          title={`후보 ${preview.candidateId} · ${preview.compilerVersion}`}
        />
      </div>

      {preview.diagnosticSummaries.length > 0 ? (
        <p className={styles.diagnostics}>
          {preview.diagnosticSummaries.slice(0, 2).join(" · ")}
          {preview.diagnosticSummaries.length > 2
            ? ` 외 ${preview.diagnosticSummaries.length - 2}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}

function SummaryDetail({
  emptyLabel,
  items,
  label,
  title
}: {
  readonly emptyLabel: string;
  readonly items: readonly string[];
  readonly label: string;
  readonly title?: string | undefined;
}) {
  return (
    <div className={styles.detail} title={title}>
      <span>{label}</span>
      <strong>{items.length === 0 ? emptyLabel : items.join(" · ")}</strong>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
