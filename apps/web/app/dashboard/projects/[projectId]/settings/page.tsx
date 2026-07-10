import { ProjectGitHubSettingsClient } from "../../../../projects/[projectId]/settings/project-github-settings-client";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Project settings</p>
          <h1>Source Repository 연결</h1>
          <p>Git/CI/CD에 사용할 GitHub Repository를 프로젝트 단위로 관리합니다.</p>
        </div>
      </header>
      <ProjectGitHubSettingsClient projectId={projectId} />
    </div>
  );
}
