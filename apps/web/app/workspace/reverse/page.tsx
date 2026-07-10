import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { ReverseWorkspaceClient } from "./reverse-workspace-client";

type ReverseWorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly projectName?: string | string[] | undefined;
  }>;
};

export default async function ReverseWorkspacePage({ searchParams }: ReverseWorkspacePageProps) {
  const params = await searchParams;
  const projectName = getSingleSearchParam(params?.projectName)?.trim() || "기존 AWS 가져오기";

  return (
    <WorkspaceAuthGate>
      <ReverseWorkspaceClient projectName={projectName} />
    </WorkspaceAuthGate>
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
