"use client";

import { Code2, GitBranch, History, PanelRightOpen, Rocket, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { TerraformOperationsPanel } from "./TerraformOperationsPanel";
import { SafetyOperationsPanel } from "./SafetyOperationsPanel";
import { DeploymentHistoryPanel } from "./DeploymentHistoryPanel";
import { DeploymentOperationsPanel } from "./DeploymentOperationsPanel";
import { GitCicdOperationsPanel } from "./GitCicdOperationsPanel";
import { useWorkspaceSafety } from "./use-workspace-safety";
import { useWorkspaceDeployment } from "./use-workspace-deployment";
import { useWorkspaceTerraform } from "./use-workspace-terraform";
import { useWorkspaceGitCicd } from "./use-workspace-git-cicd";
import styles from "./workspace-operations.module.css";

export type WorkspaceOperationTab = "terraform" | "safety" | "deployment" | "git-cicd" | "history";

// Board 위에서 Terraform, 검사, 배포, 이력을 순서대로 여는 작업 도구입니다.
export function WorkspaceOperationsDock({
  context,
  projectId
}: {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceOperationTab>("terraform");
  const [isOpen, setOpen] = useState(false);
  const terraform = useWorkspaceTerraform({
    applyDiagram: context.applyDiagramJson,
    diagram: context.diagram,
    refreshRequestId: context.terraformRefreshRequestId
  });
  const safety = useWorkspaceSafety({
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

  // 도구를 고르면 닫힌 패널도 함께 열어 사용자의 행동 결과를 바로 보여줍니다.
  function selectTab(tab: WorkspaceOperationTab): void {
    setActiveTab(tab);
    setOpen(true);
  }

  return (
    <aside
      aria-label="Workspace 작업 도구"
      className={`${styles.dock} ${isOpen ? "" : styles.dockCollapsed}`}
      data-project-id={projectId}
    >
      <nav aria-label="작업 단계" className={styles.dockToolbar} role="tablist">
        <button
          aria-label="Git/CI/CD"
          aria-selected={isOpen && activeTab === "git-cicd"}
          onClick={() => selectTab("git-cicd")}
          role="tab"
          title="Git/CI/CD"
          type="button"
        >
          <GitBranch aria-hidden="true" size={17} />
          {isOpen ? <span>Git/CI</span> : null}
        </button>
        <button
          aria-label="Terraform Preview"
          aria-selected={isOpen && activeTab === "terraform"}
          onClick={() => selectTab("terraform")}
          role="tab"
          title="Terraform Preview"
          type="button"
        >
          <Code2 aria-hidden="true" size={17} />
          {isOpen ? <span>Terraform</span> : null}
        </button>
        <button
          aria-label="안전과 비용 검사"
          aria-selected={isOpen && activeTab === "safety"}
          onClick={() => selectTab("safety")}
          role="tab"
          title="안전과 비용 검사"
          type="button"
        >
          <ShieldCheck aria-hidden="true" size={17} />
          {isOpen ? <span>검사</span> : null}
        </button>
        <button
          aria-label="배포"
          aria-selected={isOpen && activeTab === "deployment"}
          onClick={() => selectTab("deployment")}
          role="tab"
          title="배포"
          type="button"
        >
          <Rocket aria-hidden="true" size={17} />
          {isOpen ? <span>배포</span> : null}
        </button>
        <button
          aria-label="배포 이력"
          aria-selected={isOpen && activeTab === "history"}
          onClick={() => selectTab("history")}
          role="tab"
          title="배포 이력"
          type="button"
        >
          <History aria-hidden="true" size={17} />
          {isOpen ? <span>이력</span> : null}
        </button>
        <button
          aria-label={isOpen ? "작업 도구 닫기" : "작업 도구 열기"}
          onClick={() => setOpen((current) => !current)}
          title={isOpen ? "닫기" : "열기"}
          type="button"
        >
          {isOpen ? <X aria-hidden="true" size={17} /> : <PanelRightOpen aria-hidden="true" size={17} />}
        </button>
      </nav>

      {isOpen ? (
        <div role="tabpanel">
          {activeTab === "terraform" ? (
            <TerraformOperationsPanel context={context} terraform={terraform} />
          ) : activeTab === "safety" ? (
            <SafetyOperationsPanel context={context} safety={safety} />
          ) : activeTab === "deployment" ? (
            <DeploymentOperationsPanel deployment={deployment} safety={safety} />
          ) : activeTab === "git-cicd" ? (
            <GitCicdOperationsPanel deployment={deployment} gitCicd={gitCicd} projectId={projectId} />
          ) : (
            <DeploymentHistoryPanel deployment={deployment} />
          )}
        </div>
      ) : null}
    </aside>
  );
}
