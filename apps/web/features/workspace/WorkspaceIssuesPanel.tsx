import type { ArchitectureDiagnostic } from "@sketchcatch/types";
import { ArchitectureIssuesPanel } from "./ArchitectureIssuesPanel";
import { TerraformIssuesPanel } from "./TerraformIssuesPanel";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import styles from "./WorkspaceIssuesPanel.module.css";

export function WorkspaceIssuesPanel({
  architectureDiagnostics,
  onFocusArchitectureResource,
  onResolveTerraformIssueWithAi,
  terraformIssues
}: {
  readonly architectureDiagnostics: readonly ArchitectureDiagnostic[];
  readonly onFocusArchitectureResource: (diagnostic: ArchitectureDiagnostic) => void;
  readonly onResolveTerraformIssueWithAi: (issue: TerraformIssueRecord) => void;
  readonly terraformIssues: readonly TerraformIssueRecord[];
}) {
  return (
    <div className={styles.issuesPanel}>
      <div className={styles.terraformIssues}>
        <TerraformIssuesPanel issues={terraformIssues} onResolveWithAi={onResolveTerraformIssueWithAi} />
      </div>
      <ArchitectureIssuesPanel
        diagnostics={architectureDiagnostics}
        onFocusResource={onFocusArchitectureResource}
      />
    </div>
  );
}
