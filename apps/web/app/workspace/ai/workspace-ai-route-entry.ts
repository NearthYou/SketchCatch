import type { AiStartExistingProject } from "./ai-start-model";

type WorkspaceAiRouteSearchParams = {
  readonly projectId?: string | readonly string[] | undefined;
  readonly projectName?: string | readonly string[] | undefined;
};

/** Existing-project mode is valid only for the complete Repository entry contract. */
export function resolveWorkspaceAiExistingProject(
  params: WorkspaceAiRouteSearchParams
): AiStartExistingProject | undefined {
  const projectId = getSingleSearchParam(params.projectId)?.trim();
  const projectName = getSingleSearchParam(params.projectName)?.trim();

  if (!projectId || !projectName) {
    return undefined;
  }

  const query = new URLSearchParams({ projectId, projectName }).toString();

  return {
    projectId,
    projectName,
    returnHref: `/workspace/repository?${query}`
  };
}

function getSingleSearchParam(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
