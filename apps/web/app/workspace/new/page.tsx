import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { WorkspaceStartClient } from "./workspace-start-client";

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
        initialStartKind={params.mode === "template" ? "template" : undefined}
        initialTemplateId={params.templateId}
      />
    </WorkspaceAuthGate>
  );
}
