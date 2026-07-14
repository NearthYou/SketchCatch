import { redirect } from "next/navigation";
import { ProjectDeploymentTargetSettingsClient } from "../../../../projects/[projectId]/settings/project-deployment-target-settings-client";
import { ProjectCicdMonitoringSettingsClient } from "../../../../projects/[projectId]/settings/project-cicd-monitoring-settings-client";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
  readonly searchParams: Promise<{
    readonly tab?: string | readonly string[];
  }>;
};

export default async function ProjectSettingsPage({
  params,
  searchParams
}: ProjectSettingsPageProps) {
  const [{ projectId }, { tab }] = await Promise.all([params, searchParams]);

  if (tab === "github") {
    redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/repository`);
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Project settings</p>
          <h1>프로젝트 설정</h1>
          <p>배포 타깃과 CI/CD 모니터링을 프로젝트 단위로 관리합니다.</p>
        </div>
      </header>
      <ProjectDeploymentTargetSettingsClient projectId={projectId} />
      <ProjectCicdMonitoringSettingsClient projectId={projectId} />
    </div>
  );
}
