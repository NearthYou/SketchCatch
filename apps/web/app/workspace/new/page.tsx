import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import { WorkspaceStartClient } from "./workspace-start-client";

export default function NewWorkspacePage() {
  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">New design</p>
          <h1>새 설계 시작</h1>
        </div>
      </div>

      <section className="dashboardPanel workspaceStartPanel" aria-labelledby="workspace-start-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Workspace</p>
            <h2 id="workspace-start-title">워크스페이스 설정</h2>
          </div>
        </div>
        <WorkspaceStartClient />
      </section>
    </DashboardShell>
  );
}
