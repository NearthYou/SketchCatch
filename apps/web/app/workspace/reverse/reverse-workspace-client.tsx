"use client";

import { useAuth } from "../../../components/auth/auth-provider";
import { DiagramEditor } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import { ReverseEngineeringPanel } from "../../../features/workspace/ReverseEngineeringPanel";

type ReverseWorkspaceClientProps = {
  readonly projectName: string;
};

const REVERSE_PREVIEW_PROJECT_ID = "reverse-preview-project";
const REVERSE_WORKSPACE_PANEL_STATE = {
  leftPanelOpen: false,
  rightPanelOpen: true
} as const;

// Reverse 시작은 공유 보드에 기능용 스캔 폼만 연결합니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const { user } = useAuth();
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  return (
    <DiagramEditor
      initialDiagram={EMPTY_DIAGRAM}
      initialPanelLayout={REVERSE_WORKSPACE_PANEL_STATE}
      leftPanel={null}
      projectName={projectName}
      rightPanel={(context) => (
        <ReverseEngineeringPanel
          context={context}
          createProjectOnApply
          projectId={REVERSE_PREVIEW_PROJECT_ID}
          projectName={projectName}
        />
      )}
      saveStatus="미리보기"
      showSaveAction={false}
      workspaceUserName={workspaceUserName}
    />
  );
}
