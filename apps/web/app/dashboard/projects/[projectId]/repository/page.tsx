import { ProjectSourceRepositoryClient } from "../../../../projects/[projectId]/repository/project-source-repository-client";
import { getSafeCicdReturnPath } from "../../../../../features/workspace/cicd-return-navigation";

type ProjectRepositoryPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
  readonly searchParams: Promise<{
    readonly readinessKey?: string | readonly string[];
    readonly returnTo?: string | readonly string[];
  }>;
};

export default async function ProjectRepositoryPage({
  params,
  searchParams
}: ProjectRepositoryPageProps) {
  const [{ projectId }, { readinessKey, returnTo }] = await Promise.all([params, searchParams]);
  const safeReturnTo = getSafeCicdReturnPath({
    rawReturnTo: typeof returnTo === "string" ? returnTo : null,
    projectId
  });

  return (
    <ProjectSourceRepositoryClient
      projectId={projectId}
      safeReturnTo={readinessKey === "source_repository" ? safeReturnTo : null}
    />
  );
}
