import type { TerraformDiagnostic } from "@sketchcatch/types";
import { AlertCircle, GitBranch } from "lucide-react";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import { getTerraformSafeFix } from "./terraform-safe-fixes";
import styles from "./workspace.module.css";

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
          <h3>Issues</h3>
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
                  <span className={styles.terraformDiagnosticSeverity}>{issue.diagnostic.severity}</span>
                </div>
                <span>{issue.diagnostic.message}</span>
                <div className={styles.terraformDiagnosticMeta}>
                  {formatTerraformDiagnosticLocation(issue.diagnostic) ? (
                    <span>{formatTerraformDiagnosticLocation(issue.diagnostic)}</span>
                  ) : null}
                  {issue.isStale ? <span className={styles.terraformDiagnosticStale}>재검증 필요</span> : null}
                  <span>{getTerraformSafeFix(issue.diagnostic).applicable ? "자동 적용 가능" : "수동 수정 필요"}</span>
                </div>
                <button
                  className={styles.terraformDiagnosticAiButton}
                  data-terraform-issue-ai-resolution
                  onClick={() => onResolveWithAi(issue)}
                  type="button"
                >
                  AI 해결
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function formatTerraformDiagnosticLocation(diagnostic: TerraformDiagnostic): string {
  const parts = [
    diagnostic.sourceFileName,
    diagnostic.line !== undefined ? `line ${diagnostic.line}` : undefined
  ].filter(Boolean);

  return parts.join(" · ");
}
