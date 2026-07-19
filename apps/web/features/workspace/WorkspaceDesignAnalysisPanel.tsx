"use client";

import { useMemo, useState } from "react";
import type {
  AiPreDeploymentAnalysisResult,
  DesignSimulationResult,
  RiskLevel
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { runAiDesignSimulation, runAiPreDeploymentCheck } from "./api";
import {
  createWorkspaceAiBoardSnapshot,
  isWorkspaceAiResultStale
} from "./workspace-ai-panel-state";
import { createWorkspaceDesignAnalysisPresentation } from "./workspace-design-analysis-presentation";
import {
  WorkspaceAiActionHeader,
  WorkspaceAiRequestMessage
} from "./WorkspaceAiPanelPieces";
import type { AiRequestState } from "./WorkspaceAiPanelPieces";
import styles from "./workspace.module.css";

type WorkspaceDesignAnalysisPanelProps = {
  readonly context: DiagramEditorPanelContext;
};

type WorkspaceDesignAnalysisResultValue = {
  readonly preDeployment: AiPreDeploymentAnalysisResult;
  readonly simulation: DesignSimulationResult;
};

const DESIGN_ANALYSIS_DEFAULTS = {
  budgetLevel: "normal",
  expectedUserCount: 1000,
  period: "month",
  region: "ap-northeast-2",
  trafficLevel: "normal"
} as const;

export function WorkspaceDesignAnalysisPanel({ context }: WorkspaceDesignAnalysisPanelProps) {
  const [result, setResult] = useState<WorkspaceDesignAnalysisResultValue | null>(null);
  const [requestState, setRequestState] = useState<AiRequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultFingerprint, setResultFingerprint] = useState<string | null>(null);
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(context.diagram),
    [context.diagram]
  );
  const hasStaleResult =
    result !== null && isWorkspaceAiResultStale(resultFingerprint, boardSnapshot.fingerprint);

  async function runDesignAnalysis(): Promise<void> {
    if (context.isPreviewActive) {
      setRequestState("error");
      setErrorMessage("AI 초안 미리보기 중에는 현재 보드를 분석할 수 없습니다.");
      return;
    }

    if (!boardSnapshot.hasResources) {
      setRequestState("error");
      setErrorMessage("아키텍처 보드에 리소스가 있어야 설계 분석을 실행할 수 있습니다.");
      return;
    }

    setRequestState("loading");
    setErrorMessage("");

    try {
      const [simulation, preDeployment] = await Promise.all([
        runAiDesignSimulation({
          architectureJson: boardSnapshot.architectureJson,
          ...DESIGN_ANALYSIS_DEFAULTS
        }),
        runAiPreDeploymentCheck({ architectureJson: boardSnapshot.architectureJson })
      ]);

      setResult({ preDeployment, simulation });
      setResultFingerprint(boardSnapshot.fingerprint);
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(
        getApiErrorMessage(error, "설계 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
      );
    }
  }

  return (
    <section
      aria-labelledby="live-observation-design-analysis-title"
      className={styles.liveObservationDesignAnalysis}
    >
      <header className={styles.aiPanelHeader}>
        <span>DESIGN REVIEW</span>
        <h2 id="live-observation-design-analysis-title">설계 분석</h2>
        <p className={styles.aiHint}>
          현재 Board를 기준으로 배포 전에 예상되는 병목, 장애, 보안 위험과 비용을 검토합니다.
        </p>
      </header>

      <section className={styles.aiSection}>
        <WorkspaceAiActionHeader
          buttonLabel={requestState === "loading" ? "분석 중" : result ? "다시 분석" : "분석 시작"}
          disabled={requestState === "loading" || context.isPreviewActive}
          onClick={() => void runDesignAnalysis()}
          title="월 사용자 1,000명 · 보통 트래픽 · 서울 리전"
        />
        <WorkspaceAiRequestMessage message={errorMessage} state={requestState} />
        {hasStaleResult ? (
          <p className={styles.aiStaleNotice}>보드 변경됨 · 다시 실행 필요</p>
        ) : null}
        {result ? (
          <WorkspaceDesignAnalysisResult
            preDeployment={result.preDeployment}
            simulation={result.simulation}
          />
        ) : (
          <p className={styles.aiHint}>
            분석은 실제 트래픽을 만들거나 AWS 리소스를 변경하지 않습니다. 배포 후 실제 값은 Live
            Observation에서 확인할 수 있습니다.
          </p>
        )}
      </section>
    </section>
  );
}

function WorkspaceDesignAnalysisResult({
  preDeployment,
  simulation
}: WorkspaceDesignAnalysisResultValue) {
  const presentation = createWorkspaceDesignAnalysisPresentation(simulation, preDeployment);

  return (
    <div className={`${styles.aiResultStack} ${styles.aiSimulationResult}`}>
      <p className={styles.aiResultSummary}>{presentation.summary}</p>
      {presentation.assumptions.length > 0 ? (
        <p className={styles.aiHint}>가정 · {presentation.assumptions.join(" · ")}</p>
      ) : null}
      <div className={`${styles.aiSimulationGrid} ${styles.designAnalysisGrid}`}>
        <AnalysisCard title="병목 지점">
          {presentation.bottlenecks.length > 0 ? (
            presentation.bottlenecks.map((item) => (
              <li key={item.id}>
                <span>{formatRiskLevel(item.severity)} · {item.title}</span>
                <p>{item.description}</p>
              </li>
            ))
          ) : (
            <EmptyAnalysisItem text="현재 가정에서 뚜렷한 병목 후보가 없습니다." />
          )}
        </AnalysisCard>

        <AnalysisCard title="장애 지점">
          {presentation.failureScenarios.length > 0 ? (
            presentation.failureScenarios.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <p>{item.description}</p>
                <p>대응 · {item.mitigation}</p>
              </li>
            ))
          ) : (
            <EmptyAnalysisItem text="현재 설계에서 별도 장애 시나리오가 감지되지 않았습니다." />
          )}
        </AnalysisCard>

        <AnalysisCard title="보안 위험">
          {presentation.securityRisks.length > 0 ? (
            presentation.securityRisks.map((finding) => (
              <li key={finding.id}>
                <span>{formatRiskLevel(finding.severity)} · {finding.title}</span>
                <p>{finding.description}</p>
                <p>권장 · {finding.recommendation}</p>
              </li>
            ))
          ) : (
            <EmptyAnalysisItem text="기본 배포 전 점검에서 보안 위험이 감지되지 않았습니다." />
          )}
        </AnalysisCard>

        <AnalysisCard title="예상 비용">
          {presentation.costEstimate ? (
            <li>
              <div className={styles.aiSimulationCostMeta}>
                <span>{formatCostEstimate(presentation.costEstimate)}</span>
              </div>
              <p>현재 Board와 분석 가정에 따른 추정치이며 실제 청구액과 다를 수 있습니다.</p>
            </li>
          ) : null}
          {presentation.costReviewItems.map((item) => (
            <li key={item}>
              <p>{item}</p>
            </li>
          ))}
        </AnalysisCard>

        <AnalysisCard title="개선 권장사항">
          {presentation.recommendations.length > 0 ? (
            presentation.recommendations.map((recommendation) => (
              <li key={recommendation}>
                <p>{recommendation}</p>
              </li>
            ))
          ) : (
            <EmptyAnalysisItem text="현재 분석에서 추가 개선 권장사항이 없습니다." />
          )}
        </AnalysisCard>
      </div>
    </div>
  );
}

function AnalysisCard({
  children,
  title
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <section className={styles.aiSimulationCard}>
      <strong>{title}</strong>
      <ul>{children}</ul>
    </section>
  );
}

function EmptyAnalysisItem({ text }: { readonly text: string }) {
  return (
    <li>
      <p>{text}</p>
    </li>
  );
}

function formatRiskLevel(level: RiskLevel): string {
  return ({ high: "높음", low: "낮음", medium: "확인 필요" } as const)[level];
}

function formatCostEstimate({
  amount,
  currency,
  period
}: {
  readonly amount: number;
  readonly currency: "KRW" | "USD";
  readonly period: "day" | "month" | "week";
}): string {
  const periodLabel = { day: "일", month: "월", week: "주" }[period];

  return `${periodLabel} ${new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
    style: "currency"
  }).format(amount)}`;
}
