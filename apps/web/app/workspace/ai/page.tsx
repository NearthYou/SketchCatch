import { WorkspaceAiStartClient } from "./workspace-ai-start-client";

type WorkspaceAiPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceAiPage({ searchParams }: WorkspaceAiPageProps) {
  const params = await searchParams;
  const projectId = getSingleValue(params?.projectId)?.trim();
  const projectName = getSingleValue(params?.projectName)?.trim() || "Project workspace";

  return (
    <WorkspaceAiStartClient
      existingProject={
        projectId
          ? {
              projectId,
              projectName,
              returnHref: `/workspace/repository?${new URLSearchParams({
                projectId,
                projectName
              }).toString()}`
            }
          : undefined
      }
    />
  );
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
