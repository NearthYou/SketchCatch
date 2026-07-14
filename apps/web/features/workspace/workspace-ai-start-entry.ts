export function createWorkspaceAiStartHref(input: {
  readonly projectId: string;
  readonly projectName: string;
}): string {
  return `/workspace/ai?${new URLSearchParams({
    projectId: input.projectId,
    projectName: input.projectName
  }).toString()}`;
}
