import type { ArchitectureDiagnostic } from "@sketchcatch/types";
import { ArchitectureIssuesPanel } from "./ArchitectureIssuesPanel";
import { TerraformIssuesPanel } from "./TerraformIssuesPanel";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import styles from "./WorkspaceIssuesPanel.module.css";

export function WorkspaceIssuesPanel({
  architectureDiagnostics,
  onFocusArchitectureResource,
  onSelectTerraformIssue,
  selectedTerraformIssueKey,
  terraformIssues
}: {
  readonly architectureDiagnostics: readonly ArchitectureDiagnostic[];
  readonly onFocusArchitectureResource: (diagnostic: ArchitectureDiagnostic) => void;
  readonly onSelectTerraformIssue: (issue: TerraformIssueRecord) => void;
  readonly selectedTerraformIssueKey: string | null;
  readonly terraformIssues: readonly TerraformIssueRecord[];
}) {
  return (
    <div className={styles.issuesPanel}>
      <div className={styles.terraformIssues}>
        <TerraformIssuesPanel
          issues={terraformIssues}
          onSelectIssue={onSelectTerraformIssue}
          selectedIssueKey={selectedTerraformIssueKey}
        />
      </div>
      <ArchitectureIssuesPanel
        diagnostics={architectureDiagnostics}
        onFocusResource={onFocusArchitectureResource}
      />
    </div>
  );
}
