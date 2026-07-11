"use client";

import { Activity, Code2, GitBranch, History, PanelRightOpen, Rocket, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { WorkspaceAiAssistant } from "../ai-assistant/WorkspaceAiAssistant";
import { TerraformOperationsPanel } from "./TerraformOperationsPanel";
import { SafetyOperationsPanel } from "./SafetyOperationsPanel";
import { DeploymentHistoryPanel } from "./DeploymentHistoryPanel";
import { DeploymentOperationsPanel } from "./DeploymentOperationsPanel";
import { GitCicdOperationsPanel } from "./GitCicdOperationsPanel";
import { useWorkspaceSafety } from "./use-workspace-safety";
import { useWorkspaceDeployment } from "./use-workspace-deployment";
import { useWorkspaceTerraform } from "./use-workspace-terraform";
import { useWorkspaceGitCicd } from "./use-workspace-git-cicd";
import { useWorkspaceLiveObservation } from "./use-workspace-live-observation";
import { LiveObservationOperationsPanel } from "./LiveObservationOperationsPanel";
import styles from "./workspace-operations.module.css";

export type WorkspaceOperationTab = "terraform" | "safety" | "deployment" | "git-cicd" | "history" | "live";

// Board 위에서 Terraform, 검사, 배포, 이력을 순서대로 여는 작업 도구입니다.
export function WorkspaceOperationsDock({
  context,
  isOpen,
  onOpenChange,
  projectId
}: {
  readonly context: DiagramEditorPanelContext;
  readonly isOpen?: boolean | undefined;
  readonly onOpenChange?: ((isOpen: boolean) => void) | undefined;
  readonly projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceOperationTab>("terraform");
  const [internalOpen, setInternalOpen] = useState(false);
  const [isAssistantOpen, setAssistantOpen] = useState(false);
  const panelOpen = isOpen ?? internalOpen;
  const terraform = useWorkspaceTerraform({
    applyDiagram: context.applyDiagramJson,
    diagram: context.diagram,
    refreshRequestId: context.terraformRefreshRequestId
  });
  const safety = useWorkspaceSafety({
    architectureDiagnostics: terraform.architectureDiagnostics,
    diagram: context.diagram,
    terraformCode: terraform.code,
    terraformDiagnostics: terraform.diagnostics
  });
  const deployment = useWorkspaceDeployment({
    diagram: context.diagram,
    projectId,
    safety,
    saveDiagram: context.saveDiagramNow,
    terraform
  });
  const gitCicd = useWorkspaceGitCicd({ deployment: deployment.current, projectId });
  const liveObservation = useWorkspaceLiveObservation(deployment.deployments);

  // 제어형과 독립형 사용 모두 같은 열림 상태 변경 경로를 사용합니다.
  function setOpen(nextOpen: boolean): boolean {
    if (
      !nextOpen &&
      panelOpen &&
      activeTab === "terraform" &&
      terraform.isCodeDirty &&
      !window.confirm("저장하지 않은 Terraform 코드 변경을 버리고 닫을까요?")
    ) {
      return false;
    }
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (nextOpen) setAssistantOpen(false);
    return true;
  }

  // AI가 열리면 기존 작업 panel을 닫아 Board 오른쪽 도구가 겹치지 않게 합니다.
  function setAiAssistantOpen(nextOpen: boolean): void {
    if (nextOpen) {
      if (!setOpen(false)) return;
      context.setRightPanelOpen(false);
    }
    setAssistantOpen(nextOpen);
  }

  // 도구를 고르면 닫힌 패널도 함께 열어 사용자의 행동 결과를 바로 보여줍니다.
  function selectTab(tab: WorkspaceOperationTab): void {
    if (
      panelOpen &&
      activeTab === "terraform" &&
      tab !== "terraform" &&
      terraform.isCodeDirty &&
      !window.confirm("저장하지 않은 Terraform 코드 변경을 버리고 다른 작업으로 이동할까요?")
    ) {
      return;
    }
    setActiveTab(tab);
    setOpen(true);
  }

  return (
    <>
      <aside
      aria-label="Workspace 작업 도구"
      className={`${styles.dock} ${panelOpen ? "" : styles.dockCollapsed}`}
      data-project-id={projectId}
    >
      <nav aria-label="작업 단계" className={styles.dockToolbar} role="tablist">
        <button
          aria-label="Terraform Preview"
          aria-selected={panelOpen && activeTab === "terraform"}
          onClick={() => selectTab("terraform")}
          role="tab"
          title="Terraform Preview"
          type="button"
        >
          <Code2 aria-hidden="true" size={17} />
          {panelOpen ? <span>Terraform</span> : null}
        </button>
        <button
          aria-label="안전과 비용 검사"
          aria-selected={panelOpen && activeTab === "safety"}
          onClick={() => selectTab("safety")}
          role="tab"
          title="안전과 비용 검사"
          type="button"
        >
          <ShieldCheck aria-hidden="true" size={17} />
          {panelOpen ? <span>검사</span> : null}
        </button>
        <button
          aria-label="배포"
          aria-selected={panelOpen && activeTab === "deployment"}
          onClick={() => selectTab("deployment")}
          role="tab"
          title="배포"
          type="button"
        >
          <Rocket aria-hidden="true" size={17} />
          {panelOpen ? <span>배포</span> : null}
        </button>
        <button
          aria-label="Git/CI/CD"
          aria-selected={panelOpen && activeTab === "git-cicd"}
          onClick={() => selectTab("git-cicd")}
          role="tab"
          title="Git/CI/CD"
          type="button"
        >
          <GitBranch aria-hidden="true" size={17} />
          {panelOpen ? <span>Git/CI</span> : null}
        </button>
        <button
          aria-label="실시간 관찰"
          aria-selected={panelOpen && activeTab === "live"}
          onClick={() => selectTab("live")}
          role="tab"
          title="실시간 관찰"
          type="button"
        >
          <Activity aria-hidden="true" size={17} />
          {panelOpen ? <span>관찰</span> : null}
        </button>
        <button
          aria-label="배포 이력"
          aria-selected={panelOpen && activeTab === "history"}
          onClick={() => selectTab("history")}
          role="tab"
          title="배포 이력"
          type="button"
        >
          <History aria-hidden="true" size={17} />
          {panelOpen ? <span>이력</span> : null}
        </button>
        <button
          aria-label={panelOpen ? "작업 도구 닫기" : "작업 도구 열기"}
          onClick={() => setOpen(!panelOpen)}
          title={panelOpen ? "닫기" : "열기"}
          type="button"
        >
          {panelOpen ? <X aria-hidden="true" size={17} /> : <PanelRightOpen aria-hidden="true" size={17} />}
        </button>
      </nav>

      {panelOpen ? (
        <div role="tabpanel">
          {activeTab === "terraform" ? (
            <TerraformOperationsPanel context={context} terraform={terraform} />
          ) : activeTab === "safety" ? (
            <SafetyOperationsPanel context={context} safety={safety} />
          ) : activeTab === "deployment" ? (
            <DeploymentOperationsPanel deployment={deployment} safety={safety} terraform={terraform} />
          ) : activeTab === "git-cicd" ? (
            <GitCicdOperationsPanel deployment={deployment} gitCicd={gitCicd} projectId={projectId} />
          ) : activeTab === "live" ? (
            <LiveObservationOperationsPanel liveObservation={liveObservation} />
          ) : (
            <DeploymentHistoryPanel deployment={deployment} />
          )}
        </div>
      ) : null}
      </aside>
      <WorkspaceAiAssistant
        context={context}
        isOpen={isAssistantOpen}
        onOpenChange={setAiAssistantOpen}
        projectId={projectId}
        terraform={terraform}
      />
    </>
  );
}
