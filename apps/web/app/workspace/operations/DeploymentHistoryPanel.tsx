"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { WorkspaceDeploymentState } from "./use-workspace-deployment";
import { useWorkspaceDeploymentDetails } from "./use-workspace-deployment-details";
import styles from "./workspace-operations.module.css";

const CLEANUP_CONFIRMATION = "정리";
const HISTORY_PAGE_SIZE = 8;

// 배포 이력과 선택한 실행의 Resource, log, Cleanup 행동을 함께 보여줍니다.
export function DeploymentHistoryPanel({
  deployment
}: {
  readonly deployment: WorkspaceDeploymentState;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const details = useWorkspaceDeploymentDetails(deployment.current);
  const current = deployment.current;
  const canConfirmCleanup = confirmation === CLEANUP_CONFIRMATION;
  const filteredDeployments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return deployment.deployments.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        item.id.toLocaleLowerCase().includes(normalizedQuery) ||
        (item.approvedByUserId ?? "").toLocaleLowerCase().includes(normalizedQuery) ||
        formatDateTime(item.createdAt).toLocaleLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [deployment.deployments, query, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredDeployments.length / HISTORY_PAGE_SIZE));
  const visibleDeployments = filteredDeployments.slice(
    (page - 1) * HISTORY_PAGE_SIZE,
    page * HISTORY_PAGE_SIZE
  );

  // 검색어나 상태 조건이 바뀌면 결과가 있는 첫 페이지로 돌아갑니다.
  useEffect(() => setPage(1), [query, statusFilter]);

  // 배포 목록이 줄어 현재 페이지가 사라지면 마지막 유효 페이지를 유지합니다.
  useEffect(() => setPage((currentPage) => Math.min(currentPage, pageCount)), [pageCount]);

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
          <div className={styles.historyFilters}>
            <label>
              <span>이력 검색</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="실행 ID, 승인자, 날짜"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span>상태</span>
              <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                <option value="all">전체</option>
                <option value="RUNNING">실행 중</option>
                <option value="SUCCESS">성공</option>
                <option value="FAILED">실패</option>
                <option value="CANCELLED">취소</option>
                <option value="DESTROYED">정리 완료</option>
              </select>
            </label>
          </div>
          <div className={styles.historyTableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr><th>실행 시각</th><th>상태</th><th>실행자</th><th>단계</th></tr>
              </thead>
              <tbody>
                {visibleDeployments.map((item) => (
                  <tr data-selected={item.id === current?.id} key={item.id}>
                    <td>
                      <button onClick={() => deployment.select(item)} type="button">
                        {formatDateTime(item.createdAt)}
                      </button>
                    </td>
                    <td>{getHistoryStatusLabel(item.status)}</td>
                    <td>{item.approvedByUserId ?? "승인 전"}</td>
                    <td>{item.activeStage ?? item.failureStage ?? "준비"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredDeployments.length === 0 ? (
              <p className={styles.emptyText}>검색 조건에 맞는 배포 이력이 없습니다.</p>
            ) : null}
            {filteredDeployments.length > HISTORY_PAGE_SIZE ? (
              <div className={styles.actionRow} aria-label="배포 이력 페이지">
                <button
                  className={styles.secondaryButton}
                  disabled={page === 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                  type="button"
                >
                  이전
                </button>
                <span>{page} / {pageCount}</span>
                <button
                  className={styles.secondaryButton}
                  disabled={page === pageCount}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  type="button"
                >
                  다음
                </button>
              </div>
            ) : null}
          </div>

          {current ? (
            <section className={styles.historyDetails}>
              <div className={styles.sectionTitleRow}>
                <h3>선택한 실행</h3>
                <span>{current.id.slice(0, 8)}</span>
              </div>
              <dl className={styles.approvalFacts}>
                <div><dt>Terraform artifact</dt><dd>{current.terraformArtifactId}</dd></div>
                <div><dt>승인자</dt><dd>{current.approvedByUserId ?? "승인 전"}</dd></div>
                <div><dt>승인 시각</dt><dd>{current.approvedAt ? formatDateTime(current.approvedAt) : "승인 전"}</dd></div>
              </dl>
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

              <details>
                <summary>실행 log {deployment.logs.length}줄</summary>
                <pre className={styles.historyLog}>{deployment.logs.length > 0
                  ? deployment.logs.map((log) => `[${log.stage}] ${log.message}`).join("\n")
                  : "저장된 log가 없습니다."}</pre>
              </details>

              <section className={styles.cleanupSection}>
                <div>
                  <Trash2 aria-hidden="true" size={17} />
                  <div>
                    <strong>Cleanup</strong>
                    <p>아래 Resource를 삭제할 수 있습니다. 실제 삭제 수는 Cleanup Plan에서 다시 확인합니다.</p>
                  </div>
                </div>
                <details open>
                  <summary>삭제 범위 {details.resources.length}개 Resource</summary>
                  {details.resources.length > 0 ? (
                    <ul className={styles.resourceList}>
                      {details.resources.map((resource) => (
                        <li key={resource.id}>
                          <strong>{resource.terraformAddress}</strong>
                          <span>{resource.resourceId ?? "Provider ID 없음"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>저장된 Resource가 없어 Plan 결과에서 삭제 범위를 확인해야 합니다.</p>
                  )}
                </details>
                {current.status === "FAILED" && current.failureStage === "destroy" ? (
                  <p className={styles.inlineNotice} data-tone="warning">
                    일부 Resource만 삭제됐을 수 있습니다. AWS 상태를 확인한 뒤 Cleanup Plan을 다시 만드세요.
                  </p>
                ) : null}
                {deployment.actionState.shouldShowDestroyPlanButton ? (
                  <button className={styles.secondaryButton} disabled={!deployment.actionState.canRunDestroyPlan} onClick={() => void deployment.planCleanup()} type="button">
                    {current.status === "FAILED" && current.failureStage === "destroy"
                      ? "Cleanup 다시 계획"
                      : "Cleanup Plan 만들기"}
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
