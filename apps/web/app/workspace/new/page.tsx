import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { WorkspaceStartClient } from "./workspace-start-client";
import type { WorkspaceStartKind } from "./workspace-start-options";

// Dashboard에서 고른 Template 정보를 새 프로젝트 시작 화면에 전달합니다.
export default async function NewWorkspacePage({
  searchParams
}: {
  readonly searchParams: Promise<{ readonly mode?: string; readonly templateId?: string }>;
}) {
  const params = await searchParams;

  return (
    <WorkspaceAuthGate>
      <WorkspaceStartClient
        initialStartKind={parseInitialStartKind(params.mode)}
        initialTemplateId={params.templateId}
      />
    </WorkspaceAuthGate>
  );
}

function parseInitialStartKind(mode: string | undefined): WorkspaceStartKind | undefined {
  return mode === "template" || mode === "repository" ? mode : undefined;
}
