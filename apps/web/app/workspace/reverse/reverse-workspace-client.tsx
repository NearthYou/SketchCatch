"use client";

import { useCallback, useState } from "react";
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
  rightPanelOpen: true,
  startWithMinimumWidths: true
} as const;

// Reverse 시작은 공유 보드에 저장 전 AWS 미리보기 작업대를 연결합니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const { user } = useAuth();
  const [scanStatus, setScanStatus] = useState("스캔 전");
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  // 우측 RE controller가 바꾼 상태를 기존 Workspace 상단 바에만 전달합니다.
  const handleStatusChange = useCallback((nextStatus: string) => {
    setScanStatus(nextStatus);
  }, []);

  return (
    <DiagramEditor
      emptyBoardContent={<div id="reverse-engineering-empty-slot" />}
      hidePreviewNotice
      initialDiagram={EMPTY_DIAGRAM}
      initialPanelLayout={REVERSE_WORKSPACE_PANEL_STATE}
      leftPanel={null}
      projectName={projectName}
      rightPanel={(context) => (
        <ReverseEngineeringPanel
          context={context}
          createProjectOnApply
          onStatusChange={handleStatusChange}
          projectId={REVERSE_PREVIEW_PROJECT_ID}
          projectName={projectName}
        />
      )}
      saveStatus={scanStatus}
      showSaveAction={false}
      workspaceUserName={workspaceUserName}
    />
  );
}
