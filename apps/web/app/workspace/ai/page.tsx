import { WorkspaceAiShell } from "./workspace-ai-shell";
import {
  resolveWorkspaceAiExistingProject,
  resolveWorkspaceAiInitialProjectName
} from "./workspace-ai-route-entry";

type WorkspaceAiPageProps = {
  readonly searchParams: Promise<{
    readonly entry?: string | string[] | undefined;
    readonly projectId?: string | string[] | undefined;
    readonly projectName?: string | string[] | undefined;
  }>;
};

export default async function WorkspaceAiPage({ searchParams }: WorkspaceAiPageProps) {
  const params = await searchParams;
  const existingProject = resolveWorkspaceAiExistingProject(params);
  const initialProjectName = resolveWorkspaceAiInitialProjectName(params);

  return (
    <WorkspaceAiShell
      existingProject={existingProject}
      initialProjectName={initialProjectName}
    />
  );
}
