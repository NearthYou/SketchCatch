import type { TerraformDiagnostic } from "@sketchcatch/types";
import { AlertCircle, GitBranch } from "lucide-react";
import { formatTerraformDiagnosticTitle } from "./terraform-panel-utils";
import styles from "./workspace.module.css";

export function TerraformIssuesPanel({ diagnostics }: { readonly diagnostics: TerraformDiagnostic[] }) {
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
          <p className={styles.terraformEmpty}>표시할 진단이 없습니다.</p>
        ) : (
          <ol className={styles.terraformDiagnosticList}>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? diagnostic.message}-${index}`} data-severity={diagnostic.severity}>
                <strong>{formatTerraformDiagnosticTitle(diagnostic)}</strong>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
