import Link from "next/link";
import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";
import { DashboardIcon } from "../../../../components/dashboard/dashboard-icons";
import { ProjectGitHubSettingsClient } from "./project-github-settings-client";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;

  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Project settings</p>
          <h1>프로젝트 설정</h1>
        </div>
        <div className="dashboardHeaderActions">
          <Link className="dashboardSecondaryButton" href="/projects">
            <DashboardIcon name="folder" />
            <span>프로젝트 목록</span>
          </Link>
          <Link
            className="dashboardTopbarAction"
            href={`/workspace?projectId=${encodeURIComponent(projectId)}`}
          >
            <DashboardIcon name="edit" />
            <span>작업 화면</span>
          </Link>
        </div>
      </div>

      <ProjectGitHubSettingsClient projectId={projectId} />
    </DashboardShell>
  );
}
