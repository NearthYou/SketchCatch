"use client";

import { Ban, Check, CirclePlay, FileCheck2, LoaderCircle, Save, XCircle } from "lucide-react";
import type { DeploymentStatus } from "@sketchcatch/types";
import type { WorkspaceDeploymentState } from "./use-workspace-deployment";
import type { WorkspaceSafetyState } from "./use-workspace-safety";
import styles from "./workspace-operations.module.css";

// 저장부터 Apply까지 현재 한 단계만 강조하고 서로 다른 버튼으로 실행합니다.
export function DeploymentOperationsPanel({
  deployment,
  safety
}: {
  readonly deployment: WorkspaceDeploymentState;
  readonly safety: WorkspaceSafetyState;
}) {
  const current = deployment.current;
  const isBusy = deployment.requestState === "loading" || current?.status === "RUNNING";
  const blockedReason = current?.blockedReason ??
    (safety.gate.kind === "blocked" || safety.gate.kind === "not-checked"
      ? safety.gate.reason
      : "");

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Direct Deployment</p>
          <h2>단계별 배포</h2>
        </div>
        <span className={styles.statusText} data-tone={current?.status ?? "PENDING"}>
          {getDeploymentStatusLabel(current?.status)}
        </span>
      </header>

      <ol className={styles.deploymentSteps}>
        {getDeploymentSteps(current).map((step) => (
          <li data-state={step.state} key={step.label}>
            <span>{step.state === "done" ? <Check aria-hidden="true" size={13} /> : step.index}</span>
            {step.label}
          </li>
        ))}
      </ol>

      {deployment.errorMessage ? (
        <p className={styles.inlineNotice} data-tone="error">{deployment.errorMessage}</p>
      ) : null}

      {blockedReason ? (
        <p className={styles.inlineNotice} data-tone="warning">
          <Ban aria-hidden="true" size={14} /> {blockedReason}
        </p>
      ) : null}

      {current?.planSummary ? (
        <section className={styles.resultSection}>
          <div className={styles.sectionTitleRow}>
            <h3>Plan 변경 요약</h3>
            <span>{current.currentPlanOperation === "destroy" ? "Cleanup" : "Apply"}</span>
          </div>
          <div className={styles.planSummary}>
            <span><strong>{current.planSummary.createCount}</strong>생성</span>
            <span><strong>{current.planSummary.updateCount}</strong>수정</span>
            <span data-danger={current.planSummary.deleteCount > 0}><strong>{current.planSummary.deleteCount}</strong>삭제</span>
            <span data-danger={current.planSummary.replaceCount > 0}><strong>{current.planSummary.replaceCount}</strong>교체</span>
          </div>
          {current.planSummary.warnings.length > 0 ? (
            <ul className={styles.warningList}>
              {current.planSummary.warnings.map((warning) => (
                <li key={warning.id}>
                  <strong>{warning.level === "high" ? "높은 위험" : "확인"}</strong>
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className={styles.deploymentActions}>
        {!current ? (
          <button className={styles.primaryButton} disabled={isBusy} onClick={() => void deployment.prepare()} type="button">
            <Save aria-hidden="true" size={15} /> 배포 기준 저장
          </button>
        ) : null}
        {deployment.actionState.shouldShowApplyPlanButton ? (
          <button className={styles.primaryButton} disabled={!deployment.actionState.canRunApplyPlan} onClick={() => void deployment.runPlan()} type="button">
            <FileCheck2 aria-hidden="true" size={15} /> Plan 실행
          </button>
        ) : null}
        {deployment.actionState.shouldShowApprovePlanButton ? (
          <button className={styles.primaryButton} disabled={!deployment.actionState.canApprovePlan} onClick={() => void deployment.approvePlan()} type="button">
            <Check aria-hidden="true" size={15} /> {deployment.actionState.approvePlanLabel}
          </button>
        ) : null}
        {deployment.actionState.shouldShowApplyButton ? (
          <button className={styles.primaryButton} disabled={!deployment.actionState.canApply || safety.gate.kind === "blocked"} onClick={() => void deployment.apply()} type="button">
            <CirclePlay aria-hidden="true" size={15} /> Apply 실행
          </button>
        ) : null}
        {deployment.actionState.canCancelDeployment ? (
          <button className={styles.secondaryButton} onClick={() => void deployment.cancel()} type="button">
            <XCircle aria-hidden="true" size={15} /> 실행 취소
          </button>
        ) : null}
      </div>

      <section className={styles.logPanel} aria-label="실시간 배포 log">
        <div>
          <strong>실시간 log</strong>
          {current?.status === "RUNNING" ? <LoaderCircle aria-hidden="true" size={14} /> : null}
        </div>
        <pre>{deployment.logs.length > 0
          ? deployment.logs.map((log) => `[${log.stage}] ${log.message}`).join("\n")
          : "배포를 시작하면 단계별 log가 여기에 표시됩니다."}</pre>
      </section>
    </div>
  );
}

// 배포 상태를 사용자에게 익숙한 실행 상태 문구로 바꿉니다.
function getDeploymentStatusLabel(status: DeploymentStatus | undefined): string {
  if (status === "RUNNING") return "실행 중";
  if (status === "SUCCESS") return "성공";
  if (status === "FAILED") return "실패";
  if (status === "CANCELLED") return "취소";
  if (status === "DESTROYED") return "정리 완료";
  return "준비 전";
}

// Deployment 필드로 저장, 검사, Plan, 승인, Apply 단계의 진행 상태를 계산합니다.
function getDeploymentSteps(current: WorkspaceDeploymentState["current"]): readonly {
  readonly index: number;
  readonly label: string;
  readonly state: "waiting" | "current" | "done";
}[] {
  const planReady = Boolean(current?.currentPlanArtifactId);
  const approved = Boolean(current?.approvedAt);
  const applied = current?.status === "SUCCESS" || current?.status === "DESTROYED";
  return [
    { index: 1, label: "저장", state: current ? "done" : "current" },
    { index: 2, label: "검사", state: current ? "done" : "waiting" },
    { index: 3, label: "Plan", state: planReady ? "done" : current ? "current" : "waiting" },
    { index: 4, label: "승인", state: approved ? "done" : planReady ? "current" : "waiting" },
    { index: 5, label: "Apply", state: applied ? "done" : approved ? "current" : "waiting" }
  ];
}
