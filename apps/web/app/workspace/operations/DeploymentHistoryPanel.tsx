"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { WorkspaceDeploymentState } from "./use-workspace-deployment";
import { useWorkspaceDeploymentDetails } from "./use-workspace-deployment-details";
import styles from "./workspace-operations.module.css";

const CLEANUP_CONFIRMATION = "정리";

// 배포 이력과 선택한 실행의 Resource, log, Cleanup 행동을 함께 보여줍니다.
export function DeploymentHistoryPanel({
  deployment
}: {
  readonly deployment: WorkspaceDeploymentState;
}) {
  const [confirmation, setConfirmation] = useState("");
  const details = useWorkspaceDeploymentDetails(deployment.current);
  const current = deployment.current;
  const canConfirmCleanup = confirmation === CLEANUP_CONFIRMATION;

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Deployment History</p>
          <h2>배포 이력과 Cleanup</h2>
        </div>
        <span className={styles.statusText}>{deployment.deployments.length}개</span>
      </header>

      {deployment.deployments.length === 0 ? (
        <p className={styles.emptyText}>아직 실행한 배포가 없습니다.</p>
      ) : (
        <div className={styles.historyLayout}>
          <div className={styles.historyTableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr><th>실행 시각</th><th>상태</th><th>단계</th></tr>
              </thead>
              <tbody>
                {deployment.deployments.map((item) => (
                  <tr data-selected={item.id === current?.id} key={item.id}>
                    <td>
                      <button onClick={() => deployment.select(item)} type="button">
                        {formatDateTime(item.createdAt)}
                      </button>
                    </td>
                    <td>{getHistoryStatusLabel(item.status)}</td>
                    <td>{item.activeStage ?? item.failureStage ?? "준비"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {current ? (
            <section className={styles.historyDetails}>
              <div className={styles.sectionTitleRow}>
                <h3>선택한 실행</h3>
                <span>{current.id.slice(0, 8)}</span>
              </div>
              {details.errorMessage ? (
                <p className={styles.inlineNotice} data-tone="error">{details.errorMessage}</p>
              ) : null}
              {current.errorSummary ? (
                <div className={styles.failureDetails}>
                  <strong>원본 오류</strong>
                  <p>{current.errorSummary}</p>
                  {details.explanation ? (
                    <>
                      <strong>쉬운 설명</strong>
                      <p>{details.explanation.summary}</p>
                      <ul>{details.explanation.nextActions.map((action) => <li key={action}>{action}</li>)}</ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              <details open={details.resources.length > 0}>
                <summary>생성된 Resource {details.resources.length}개</summary>
                <ul className={styles.resourceList}>
                  {details.resources.map((resource) => (
                    <li key={resource.id}>
                      <strong>{resource.terraformAddress}</strong>
                      <span>{resource.resourceId ?? "Provider ID 없음"}</span>
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary>Terraform output {details.outputs.length}개</summary>
                <dl className={styles.outputList}>
                  {details.outputs.map((output) => (
                    <div key={output.id}>
                      <dt>{output.name}</dt>
                      <dd>{output.sensitive ? "숨김" : formatOutputValue(output.value)}</dd>
                    </div>
                  ))}
                </dl>
              </details>

              <section className={styles.cleanupSection}>
                <div>
                  <Trash2 aria-hidden="true" size={17} />
                  <div>
                    <strong>Cleanup</strong>
                    <p>삭제 예정 Resource를 Plan에서 먼저 확인합니다.</p>
                  </div>
                </div>
                {deployment.actionState.shouldShowDestroyPlanButton ? (
                  <button className={styles.secondaryButton} disabled={!deployment.actionState.canRunDestroyPlan} onClick={() => void deployment.planCleanup()} type="button">
                    Cleanup Plan 만들기
                  </button>
                ) : null}
                {current.currentPlanOperation === "destroy" && deployment.actionState.shouldShowApprovePlanButton ? (
                  <button className={styles.secondaryButton} disabled={!deployment.actionState.canApprovePlan} onClick={() => void deployment.approvePlan()} type="button">
                    Cleanup Plan 승인
                  </button>
                ) : null}
                {deployment.actionState.shouldShowDestroyButton ? (
                  <label className={styles.cleanupConfirmation}>
                    <span>실행하려면 “{CLEANUP_CONFIRMATION}”를 입력하세요.</span>
                    <input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
                    <button disabled={!canConfirmCleanup || !deployment.actionState.canDestroy} onClick={() => void deployment.cleanup()} type="button">
                      Cleanup 실행
                    </button>
                  </label>
                ) : null}
              </section>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ISO 시각을 현재 브라우저의 읽기 쉬운 날짜와 시간으로 표시합니다.
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value)
  );
}

// 배포 상태 코드를 이력 표에서 짧게 읽히는 문구로 바꿉니다.
function getHistoryStatusLabel(status: WorkspaceDeploymentState["deployments"][number]["status"]): string {
  if (status === "SUCCESS") return "성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  if (status === "CANCELLED") return "취소";
  if (status === "DESTROYED") return "정리 완료";
  return "준비";
}

// Terraform output의 unknown 값을 화면에 안전한 문자열로 바꿉니다.
function formatOutputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "값 없음";
  return JSON.stringify(value);
}
