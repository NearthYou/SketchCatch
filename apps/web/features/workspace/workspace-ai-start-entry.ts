export function createWorkspaceAiStartHref(input: {
  readonly projectId: string;
  readonly projectName: string;
}): string {
  const params = new URLSearchParams({
    entry: "repository_analysis",
    projectName: input.projectName
  });
  const projectId = input.projectId.trim();

  if (projectId) {
    params.set("projectId", projectId);
  }

  return `/workspace/ai?${params.toString()}`;
}
