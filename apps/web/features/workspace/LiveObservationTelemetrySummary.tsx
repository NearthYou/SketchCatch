import React from "react";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import {
  createLiveObservationTelemetryModel,
  type LiveObservationAiState
} from "./live-observation-telemetry";
import styles from "./live-observation-signal-dashboard.module.css";

export function LiveObservationTelemetrySummary({
  aiError,
  aiState,
  architecture,
  snapshot
}: {
  readonly aiError?: string | undefined;
  readonly aiState: LiveObservationAiState;
  readonly architecture: ArchitectureJson | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
}) {
  const model = createLiveObservationTelemetryModel({ aiState, architecture, snapshot });
  const providerLabel = getProviderLabel(model.providerState);
  const taskLabel =
    model.expectedTaskCount === null
      ? "예상 대기"
      : `${model.expectedTaskCount}개 예상 · ${model.actualTaskCount ?? "확인 중"}개 실제`;

  return (
    <section
      aria-label="실시간 수집 지표"
      className={styles.telemetrySummary}
      data-provider-state={model.providerState}
      data-testid="live-observation-telemetry"
    >
      <header className={styles.telemetryHeader}>
        <div>
          <p className={styles.eyebrow}>관측 근거</p>
          <h2>실시간 수집 지표</h2>
        </div>
        <span className={styles.telemetryProviderState}>{providerLabel}</span>
      </header>
      <div className={styles.telemetryGrid}>
        <TelemetryMetric label="수집 요청" value={`${model.acceptedEventCount}건`} />
        <TelemetryMetric label="최근 속도" value={`${formatDecimal(model.rollingRequestsPerSecond)} RPS`} />
        <TelemetryMetric label="1분 환산" value={`${Math.round(model.projectedRequestsPerMinute)} req/min`} />
        <TelemetryMetric
          label="압력"
          value={`${Math.round(model.pressurePercent)}% · ${getPressureLabel(model.pressureLevel)}`}
        />
        <TelemetryMetric label="Task" value={taskLabel} />
        <TelemetryMetric label="AI 분석" value={getAiLabel(model.aiState)} />
      </div>
      <p className={styles.telemetryNote}>
        {snapshot
          ? `Store가 즉시 받은 요청 ${model.acceptedEventCount}건을 집계 중입니다. AWS 지표는 CloudWatch 관측 주기 때문에 ${providerLabel} 상태로 늦게 도착할 수 있습니다.`
          : "관측을 시작하면 봇 요청과 AWS 관측값이 이 영역에 순서대로 표시됩니다."}
      </p>
      {aiError ? <p className={styles.telemetryError}>{aiError}</p> : null}
    </section>
  );
}

function TelemetryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.telemetryMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getProviderLabel(state: "available" | "delayed" | "unavailable" | "not_started"): string {
  if (state === "available") return "AWS 지표 수신";
  if (state === "delayed") return "AWS 지표 지연";
  if (state === "unavailable") return "AWS 지표 대기";
  return "AWS 관측 시작 대기";
}

function getPressureLabel(level: LiveObservationV2Snapshot["live"]["pressureLevel"]): string {
  if (level === "critical") return "위험";
  if (level === "high") return "높음";
  if (level === "warning") return "주의";
  return "정상";
}

function getAiLabel(state: LiveObservationAiState): string {
  if (state === "loading") return "분석 중";
  if (state === "ready") return "분석 완료";
  if (state === "error") return "분석 실패";
  return "대기 중";
}
