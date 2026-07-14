import type { TerraformDiagnostic } from "@sketchcatch/types";
import { AlertCircle, GitBranch } from "lucide-react";
import { formatTerraformDiagnosticSeverity } from "./terraform-diagnostic-presentation";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import { getTerraformSafeFix } from "./terraform-safe-fixes";
import { TerraformIssueAnalysisButton } from "./TerraformIssueAnalysisButton";
import styles from "./TerraformIssuesPanel.module.css";

// Terraform 검증 결과를 위치, 심각도, 수정 가능 여부와 함께 보여줍니다.
export function TerraformIssuesPanel({
  issues,
  onResolveWithAi
}: {
  readonly issues: readonly TerraformIssueRecord[];
  readonly onResolveWithAi: (issue: TerraformIssueRecord) => void;
}) {
  const diagnostics = issues.map((issue) => issue.diagnostic);
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const firstErrorDiagnostic = diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? null;

  return (
    <div className={styles.issuesPanel}>
      <section className={styles.terraformDiagnostics} aria-live="polite">
        <div className={styles.terraformDiagnosticsHeader}>
          {firstErrorDiagnostic ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <GitBranch size={15} aria-hidden="true" />
          )}
          <div>
            <span>Terraform diagnostics</span>
            <h3>검증 문제</h3>
          </div>
          <span className={hasErrorDiagnostics ? styles.terraformIssueCountError : styles.terraformIssueCount}>
            {diagnostics.length}
          </span>
        </div>

        {diagnostics.length === 0 ? (
          <p className={styles.terraformEmpty}>표시할 Terraform 이슈가 없습니다.</p>
        ) : (
          <ol className={styles.terraformDiagnosticList}>
            {issues.map((issue, index) => (
              <li key={`${issue.diagnosticKey}-${index}`} data-severity={issue.diagnostic.severity}>
                <div className={styles.terraformDiagnosticItemHeader}>
                  <strong>{formatTerraformDiagnosticTitle(issue.diagnostic)}</strong>
                  <span className={styles.terraformDiagnosticSeverity}>
                    {formatTerraformDiagnosticSeverity(issue.diagnostic.severity)}
                  </span>
                </div>
                <span>{issue.diagnostic.message}</span>
                <div className={styles.terraformDiagnosticMeta}>
                  {formatTerraformDiagnosticLocation(issue.diagnostic) ? (
                    <span>{formatTerraformDiagnosticLocation(issue.diagnostic)}</span>
                  ) : null}
                  {issue.isStale ? <span className={styles.terraformDiagnosticStale}>재검증 필요</span> : null}
                  <span>{getTerraformSafeFix(issue.diagnostic).applicable ? "자동 적용 가능" : "수동 수정 필요"}</span>
                </div>
                <TerraformIssueAnalysisButton onAnalyze={() => onResolveWithAi(issue)} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// Terraform 진단 위치를 파일명과 줄 번호로 짧게 표시합니다.
function formatTerraformDiagnosticLocation(diagnostic: TerraformDiagnostic): string {
  const parts = [
    diagnostic.sourceFileName,
    diagnostic.line !== undefined ? `line ${diagnostic.line}` : undefined
  ].filter(Boolean);

  return parts.join(" · ");
}
