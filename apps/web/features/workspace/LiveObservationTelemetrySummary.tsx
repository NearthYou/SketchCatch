import React, { memo, useMemo } from "react";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import {
  createLiveObservationTelemetryModel,
  type LiveObservationAiState,
  type LiveObservationTelemetryModel
} from "./live-observation-telemetry";
import styles from "./live-observation-signal-dashboard.module.css";

type LiveObservationTelemetrySummaryProps = {
  readonly aiError?: string | undefined;
  readonly aiState: LiveObservationAiState;
  readonly architecture: ArchitectureJson | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
};

export const LiveObservationTelemetrySummary = memo(
  function LiveObservationTelemetrySummary({
    aiError,
    aiState,
    architecture,
    snapshot
  }: LiveObservationTelemetrySummaryProps) {
    const model = useMemo(
      () => createLiveObservationTelemetryModel({ aiState, architecture, snapshot }),
      [aiState, architecture, snapshot]
    );
    const provider = getProviderPresentation(model, snapshot !== null);
    const actualTaskLabel =
      model.actualTaskCount === null ? "실제 확인 중" : `${model.actualTaskCount}개 실제`;
    const expectedTaskLabel =
      model.expectedTaskCount === null ? "예상 대기" : `${model.expectedTaskCount}개 예상`;

    return (
      <section
        aria-label="실시간 수집 지표"
        className={styles.telemetrySummary}
        data-provider-state={provider.state}
        data-testid="live-observation-telemetry"
      >
        <header className={styles.telemetryHeader}>
          <div>
            <p className={styles.eyebrow}>관측 근거</p>
            <h2>실시간 수집 지표</h2>
          </div>
          <span className={styles.telemetryProviderState}>{provider.label}</span>
        </header>
        <div className={styles.telemetryGrid}>
          <TelemetryMetric label="수집 요청" value={`${model.acceptedEventCount}건`} />
          <TelemetryMetric
            label="최근 속도"
            value={`${formatDecimal(model.rollingRequestsPerSecond)} RPS`}
          />
          <TelemetryMetric
            label="1분 환산"
            value={`${Math.round(model.projectedRequestsPerMinute)} req/min`}
          />
          <TelemetryMetric
            label="압력"
            value={`${Math.round(model.pressurePercent)}% · ${getPressureLabel(model.pressureLevel)}`}
          />
          <TelemetryMetric label="Task" value={`${actualTaskLabel} · ${expectedTaskLabel}`} />
          <TelemetryMetric label="AI 분석" value={getAiLabel(model.aiState)} />
        </div>
        <p className={styles.telemetryNote}>{provider.note}</p>
        {aiError ? <p className={styles.telemetryError}>{aiError}</p> : null}
      </section>
    );
  }
);

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

function getProviderPresentation(
  model: LiveObservationTelemetryModel,
  hasSnapshot: boolean
): Readonly<{
  label: string;
  note: string;
  state: "available" | "delayed" | "ended" | "not_started" | "unavailable";
}> {
  if (model.sessionStatus === "stopped") {
    return {
      label: "관측 종료",
      note: "관측이 종료되어 마지막으로 확인한 값입니다.",
      state: "ended"
    };
  }
  if (model.sessionStatus === "expired") {
    return {
      label: "관측 만료",
      note: "관측 시간이 만료되어 마지막으로 확인한 값입니다.",
      state: "ended"
    };
  }
  if (model.providerState === "available") {
    return {
      label: "AWS 지표 수신",
      note: `Store가 즉시 받은 요청 ${model.acceptedEventCount}건을 집계 중이며 AWS 지표도 수신했습니다.`,
      state: "available"
    };
  }
  if (model.providerState === "delayed") {
    return {
      label: "AWS 지표 지연",
      note: `Store가 즉시 받은 요청 ${model.acceptedEventCount}건을 집계 중입니다. AWS 지표는 CloudWatch 관측 주기 때문에 늦게 도착할 수 있습니다.`,
      state: "delayed"
    };
  }
  if (model.providerState === "unavailable") {
    return {
      label: "AWS 관측 불가",
      note: `Store가 즉시 받은 요청 ${model.acceptedEventCount}건을 집계 중이지만 AWS 지표를 확인하지 못했습니다. 연결과 관측 권한을 확인해 주세요.`,
      state: "unavailable"
    };
  }

  return {
    label: "AWS 관측 시작 대기",
    note: hasSnapshot
      ? `Store가 즉시 받은 요청 ${model.acceptedEventCount}건을 집계 중이며 AWS 관측 값은 아직 도착하지 않았습니다.`
      : "관측을 시작하면 봇 요청과 AWS 관측값을 이 영역에서 서로 따로 표시합니다.",
    state: "not_started"
  };
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
