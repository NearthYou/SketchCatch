"use client";

import { AlertTriangle, CheckCircle2, CircleDollarSign, ShieldAlert } from "lucide-react";
import type { DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { createResourceCostView } from "../../../features/workspace/safety-cost-view";
import type { WorkspaceSafetyState } from "./use-workspace-safety";
import styles from "./workspace-operations.module.css";

// 비용 합계, 위험 finding, checklist를 같은 검사 결과 안에서 보여줍니다.
export function SafetyOperationsPanel({
  context,
  safety
}: {
  readonly context: DiagramEditorPanelContext;
  readonly safety: WorkspaceSafetyState;
}) {
  const analysis = safety.analysis;
  const hasUnknownCost = analysis?.resourceCostEstimates.some(
    (estimate) => estimate.supportLevel === "not_estimated"
  ) ?? false;
  const resourceCosts = createResourceCostView(analysis?.resourceCostEstimates ?? []);

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Safety / Cost Check</p>
          <h2>배포 전 검사</h2>
        </div>
        <span className={styles.statusText} data-tone={safety.gate.kind}>
          {getSafetyGateLabel(safety.gate.kind)}
        </span>
      </header>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={safety.requestState === "analyzing"}
          onClick={() => void safety.run()}
          type="button"
        >
          <ShieldAlert aria-hidden="true" size={15} />
          {safety.requestState === "analyzing" ? "검사 중" : "검사 실행"}
        </button>
      </div>

      {safety.errorMessage ? (
        <p className={styles.inlineNotice} data-tone="error">{safety.errorMessage}</p>
      ) : null}

      {!analysis ? (
        <p className={styles.emptyText}>현재 Board를 검사하면 비용과 위험을 함께 보여줍니다.</p>
      ) : (
        <>
          <div className={styles.metricGrid}>
            <article>
              <CircleDollarSign aria-hidden="true" size={18} />
              <span>예상 월 비용</span>
              <strong>{formatMoney(analysis.totalMonthlyEstimate)}</strong>
              {hasUnknownCost ? <small>일부 Resource는 계산 못 함</small> : null}
            </article>
            <article>
              <AlertTriangle aria-hidden="true" size={18} />
              <span>높은 위험</span>
              <strong>{safety.gate.highFindingCount}개</strong>
              <small>{safety.gate.reason}</small>
            </article>
            <article>
              <CheckCircle2 aria-hidden="true" size={18} />
              <span>확인 항목</span>
              <strong>{analysis.checklist.length}개</strong>
              <small>{analysis.summary}</small>
            </article>
          </div>

          <section className={styles.resultSection}>
            <div className={styles.sectionTitleRow}>
              <h3>Resource별 예상 비용</h3>
              <span>{analysis.resourceCostEstimates.length}개</span>
            </div>
            {resourceCosts.estimated.length === 0 ? (
              <p className={styles.emptyText}>계산된 Resource 비용이 없습니다.</p>
            ) : (
              <ul className={styles.resourceCostList}>
                {resourceCosts.estimated.map((estimate) => (
                  <li key={estimate.resourceId}>
                    <button onClick={() => context.focusResourceNode(estimate.resourceId)} type="button">
                      <strong>{estimate.name}</strong>
                      <b>{formatMoney(estimate.monthlyEstimate)} / 월</b>
                      <span>{estimate.resourceType} · {estimate.supportReason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resourceCosts.unavailable.length > 0 ? (
              <details className={styles.gitDetails}>
                <summary>계산 못 한 Resource {resourceCosts.unavailable.length}개</summary>
                <ul className={styles.resourceCostList}>
                  {resourceCosts.unavailable.map((estimate) => (
                    <li key={estimate.resourceId}>
                      <button onClick={() => context.focusResourceNode(estimate.resourceId)} type="button">
                        <strong>{estimate.name}</strong>
                        <b>계산 못 함</b>
                        <small>{estimate.supportReason}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <section className={styles.resultSection}>
            <div className={styles.sectionTitleRow}>
              <h3>발견한 위험</h3>
              <span>{analysis.findings.length}개</span>
            </div>
            {analysis.findings.length === 0 ? (
              <p className={styles.emptyText}>현재 기준에서 발견한 위험이 없습니다.</p>
            ) : (
              <ul className={styles.findingList}>
                {analysis.findings.map((finding) => (
                  <li data-severity={finding.severity} key={finding.id}>
                    <button
                      disabled={!finding.resourceId}
                      onClick={() => finding.resourceId && context.focusResourceNode(finding.resourceId)}
                      type="button"
                    >
                      <span className={styles.severityLabel}>{getSeverityLabel(finding.severity)}</span>
                      <strong>{finding.title}</strong>
                      <span>{finding.description}</span>
                      <small>{finding.recommendation}</small>
                      {finding.aiSafetyExplanation ? (
                        <small>AI 설명: {finding.aiSafetyExplanation.riskSummary}</small>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.resultSection}>
            <div className={styles.sectionTitleRow}>
              <h3>배포 전 checklist</h3>
              <span>{analysis.checklist.length}개</span>
            </div>
            <ul className={styles.checklist}>
              {analysis.checklist.map((item) => (
                <li data-status={item.status} key={item.id}>
                  <span>{getChecklistStatusLabel(item.status)}</span>
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

// 안전 게이트 내부 상태를 Apply 가능 여부가 드러나는 문구로 바꿉니다.
function getSafetyGateLabel(kind: WorkspaceSafetyState["gate"]["kind"]): string {
  if (kind === "ready") return "통과";
  if (kind === "warning") return "경고 확인";
  if (kind === "blocked") return "Apply 차단";
  return "검사 전";
}

// 통화 종류를 유지한 채 비용을 월 합계 형식으로 표시합니다.
function formatMoney(money: { readonly amount: number; readonly currency: "USD" | "KRW" }): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: money.currency === "KRW" ? 0 : 2
  }).format(money.amount);
}

// 위험도를 색뿐 아니라 텍스트로도 구분합니다.
function getSeverityLabel(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "높음";
  if (severity === "medium") return "보통";
  return "낮음";
}

// checklist 상태를 아이콘 없이도 이해할 수 있는 한국어로 바꿉니다.
function getChecklistStatusLabel(status: "pass" | "warning" | "fail"): string {
  if (status === "pass") return "통과";
  if (status === "warning") return "확인";
  return "실패";
}
