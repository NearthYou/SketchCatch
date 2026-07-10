import { DesignDashboardPage } from "../../../../../features/dashboard/design-dashboard";
import { ProjectGitHubSettingsClient } from "../../../../projects/[projectId]/settings/project-github-settings-client";

type ProjectSettingsPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

// 실제 Project Settings 경로에 GitHub 연결과 Repository Analysis 화면을 배치합니다.
export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;

  return (
    <DesignDashboardPage projectId={projectId} view="project-settings">
      <ProjectGitHubSettingsClient projectId={projectId} />
    </DesignDashboardPage>
  );
}
