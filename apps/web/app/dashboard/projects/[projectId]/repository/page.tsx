import { ProjectSourceRepositoryClient } from "../../../../projects/[projectId]/repository/project-source-repository-client";

type ProjectRepositoryPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export default async function ProjectRepositoryPage({ params }: ProjectRepositoryPageProps) {
  const { projectId } = await params;

  return <ProjectSourceRepositoryClient projectId={projectId} />;
}
