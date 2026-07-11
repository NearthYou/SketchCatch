"use client";

import { Ban, Check, CirclePlay, FileCheck2, LoaderCircle, Save, XCircle } from "lucide-react";
import type { DeploymentStatus } from "@sketchcatch/types";
import type { WorkspaceDeploymentState } from "./use-workspace-deployment";
import type { WorkspaceSafetyState } from "./use-workspace-safety";
import type { WorkspaceTerraformState } from "./use-workspace-terraform";
import {
  getDirectDeploymentFlow,
  type DirectDeploymentPreflightState
} from "../../../features/workspace/deployment-console-state";
import styles from "./workspace-operations.module.css";

// 저장부터 Apply까지 현재 한 단계만 강조하고 서로 다른 버튼으로 실행합니다.
export function DeploymentOperationsPanel({
  deployment,
  safety,
  terraform
}: {
  readonly deployment: WorkspaceDeploymentState;
  readonly safety: WorkspaceSafetyState;
  readonly terraform: WorkspaceTerraformState;
}) {
  const current = deployment.current;
  const isBusy = deployment.requestState === "loading" || current?.status === "RUNNING";
  const flow = getDirectDeploymentFlow({
    actions: deployment.actionState,
    deployment: current,
    hasUnsavedBaseline: terraform.previewState !== "current",
    preflightState: getPreflightState(safety),
    requestState: deployment.requestState
  });
  const activeStep = flow.steps.find((step) => step.id === flow.activeStepId);
  const blockedReason = current?.blockedReason ?? activeStep?.disabledReason ??
    (safety.gate.kind === "blocked" || safety.gate.kind === "not-checked"
      ? safety.gate.reason
      : "");
  const isCleanupPlan = current?.currentPlanOperation === "destroy";

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
        {flow.steps.map((step, index) => (
          <li data-state={step.state} key={step.id} title={step.description}>
            <span>{step.state === "done" ? <Check aria-hidden="true" size={13} /> : index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.statusLabel}</small>
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
        {flow.activeStepId === "save" ? (
          <button className={styles.primaryButton} disabled={isBusy} onClick={() => void terraform.generate()} type="button">
            <Save aria-hidden="true" size={15} /> Terraform 다시 생성
          </button>
        ) : null}
        {!current && flow.activeStepId !== "save" ? (
          <button
            className={styles.primaryButton}
            disabled={isBusy || safety.gate.kind === "not-checked" || safety.gate.kind === "blocked"}
            onClick={() => void deployment.prepare()}
            type="button"
          >
            <Save aria-hidden="true" size={15} /> 배포 기준 저장
          </button>
        ) : null}
        {deployment.actionState.shouldShowApplyPlanButton && !isCleanupPlan ? (
          <button className={styles.primaryButton} disabled={!deployment.actionState.canRunApplyPlan} onClick={() => void deployment.runPlan()} type="button">
            <FileCheck2 aria-hidden="true" size={15} /> Plan 실행
          </button>
        ) : null}
        {deployment.actionState.shouldShowApprovePlanButton && !isCleanupPlan ? (
          <button className={styles.primaryButton} disabled={!deployment.actionState.canApprovePlan} onClick={() => void deployment.approvePlan()} type="button">
            <Check aria-hidden="true" size={15} /> {deployment.actionState.approvePlanLabel}
          </button>
        ) : null}
        {deployment.actionState.shouldShowApplyButton && !isCleanupPlan ? (
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

// Safety 검사 상태를 배포 5단계 계산기가 사용하는 상태로 바꿉니다.
function getPreflightState(safety: WorkspaceSafetyState): DirectDeploymentPreflightState {
  if (safety.requestState === "analyzing") return "loading";
  if (safety.errorMessage) return "error";
  if (safety.gate.kind === "blocked") return "blocked";
  if (safety.gate.kind === "warning") return "warning";
  if (safety.gate.kind === "ready") return "passed";
  return "idle";
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
