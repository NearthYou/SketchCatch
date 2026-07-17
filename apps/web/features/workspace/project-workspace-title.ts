const PROJECT_WORKSPACE_FALLBACK_TITLE = "프로젝트 보드";

export function resolveProjectWorkspaceTitle(projectName: string | undefined): string {
  return projectName?.trim() || PROJECT_WORKSPACE_FALLBACK_TITLE;
}

/** URL query text is only an initial hint; the saved project name is the workspace title authority. */
export async function loadProjectWorkspaceTitle(input: {
  readonly fallbackProjectName: string | undefined;
  readonly loadProject: () => Promise<{ readonly name: string }>;
}): Promise<string> {
  try {
    const project = await input.loadProject();
    return resolveProjectWorkspaceTitle(project.name);
  } catch {
    return resolveProjectWorkspaceTitle(input.fallbackProjectName);
  }
}
