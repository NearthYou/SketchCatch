import type { ArchitectureDiagnostic } from "@sketchcatch/types";
import { AlertCircle, Network } from "lucide-react";
import { formatTerraformDiagnosticSeverity } from "./terraform-diagnostic-presentation";
import styles from "./TerraformIssuesPanel.module.css";

export function ArchitectureIssuesPanel({
  diagnostics,
  onFocusResource
}: {
  readonly diagnostics: readonly ArchitectureDiagnostic[];
  readonly onFocusResource: (diagnostic: ArchitectureDiagnostic) => void;
}) {
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return (
    <section className={styles.terraformDiagnostics} aria-live="polite">
      <div className={styles.terraformDiagnosticsHeader}>
        {hasErrorDiagnostics ? (
          <AlertCircle size={15} aria-hidden="true" />
        ) : (
          <Network size={15} aria-hidden="true" />
        )}
        <div>
          <span>Architecture diagnostics</span>
          <h3>설계 문제</h3>
        </div>
        <span
          className={
            hasErrorDiagnostics ? styles.terraformIssueCountError : styles.terraformIssueCount
          }
        >
          {diagnostics.length}
        </span>
      </div>

      {diagnostics.length === 0 ? (
        <p className={styles.terraformEmpty}>표시할 Architecture 이슈가 없습니다.</p>
      ) : (
        <ol className={styles.terraformDiagnosticList}>
          {diagnostics.map((diagnostic) => (
            <li
              key={`${diagnostic.ruleId}:${diagnostic.resourceNodeId}`}
              data-severity={diagnostic.severity}
            >
              <div className={styles.terraformDiagnosticItemHeader}>
                <strong>{diagnostic.summary}</strong>
                <span className={styles.terraformDiagnosticSeverity}>
                  {formatTerraformDiagnosticSeverity(diagnostic.severity)}
                </span>
              </div>
              <span className={styles.terraformDiagnosticMessage}>{diagnostic.message}</span>
              <button
                className={styles.architectureFocusButton}
                onClick={() => onFocusResource(diagnostic)}
                type="button"
              >
                보드에서 보기
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
