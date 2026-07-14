import { ProjectGitHubSettingsClient } from "../../../../projects/[projectId]/settings/project-github-settings-client";

type ProjectRepositoryPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectRepositoryPage({ params }: ProjectRepositoryPageProps) {
  const { projectId } = await params;

  return <ProjectGitHubSettingsClient projectId={projectId} />;
}
