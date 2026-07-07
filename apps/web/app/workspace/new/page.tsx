import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkspaceStartClient } from "./workspace-start-client";

const COPY = {
  newProjectStart: "\uC0C8 \uD504\uB85C\uC81D\uD2B8 \uC2DC\uC791",
  projectSettings: "\uD504\uB85C\uC81D\uD2B8 \uC124\uC815"
} as const;

export default function NewWorkspacePage() {
  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">New project</p>
          <h1>{COPY.newProjectStart}</h1>
        </div>
      </div>

      <section className="dashboardPanel workspaceStartPanel" aria-labelledby="workspace-start-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Workspace</p>
            <h2 id="workspace-start-title">{COPY.projectSettings}</h2>
          </div>
        </div>
        <WorkspaceStartClient />
      </section>
    </DashboardShell>
  );
}