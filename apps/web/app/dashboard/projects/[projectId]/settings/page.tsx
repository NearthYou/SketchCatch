import { ProjectGitHubSettingsClient } from "../../../../projects/[projectId]/settings/project-github-settings-client";
import { ProjectDeploymentTargetSettingsClient } from "../../../../projects/[projectId]/settings/project-deployment-target-settings-client";
import { ProjectCicdMonitoringSettingsClient } from "../../../../projects/[projectId]/settings/project-cicd-monitoring-settings-client";

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
          <h1>프로젝트 설정</h1>
          <p>배포 타깃과 source repository를 프로젝트 단위로 관리합니다.</p>
        </div>
      </header>
      <ProjectDeploymentTargetSettingsClient projectId={projectId} />
      <ProjectCicdMonitoringSettingsClient projectId={projectId} />
      <ProjectGitHubSettingsClient projectId={projectId} />
    </div>
  );
}
