import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { RepositoryStartClient } from "./repository-start-client";

type RepositoryStartPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RepositoryStartPage({ searchParams }: RepositoryStartPageProps) {
  const params = await searchParams;

  return (
    <WorkspaceAuthGate>
      <RepositoryStartClient
        defaultBranch={getSingleValue(params?.defaultBranch) ?? "main"}
        projectId={getSingleValue(params?.projectId) ?? ""}
        repositoryUrl={getSingleValue(params?.repositoryUrl) ?? ""}
      />
    </WorkspaceAuthGate>
  );
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
