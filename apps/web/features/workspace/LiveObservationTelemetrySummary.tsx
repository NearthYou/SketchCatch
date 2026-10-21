import React, { memo, useMemo } from "react";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import {
  createLiveObservationTelemetryModel,
  type LiveObservationAiState
} from "./live-observation-telemetry";
import styles from "./live-observation-signal-dashboard.module.css";

type LiveObservationTelemetrySummaryProps = {
  readonly aiError?: string | undefined;
  readonly aiState: LiveObservationAiState;
  readonly architecture: ArchitectureJson | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
};

export const LiveObservationTelemetrySummary = memo(function LiveObservationTelemetrySummary({
  aiError,
  aiState,
  architecture,
  snapshot
}: LiveObservationTelemetrySummaryProps) {
  const model = useMemo(
    () => createLiveObservationTelemetryModel({ aiState, architecture, snapshot }),
    [aiState, architecture, snapshot]
  );
  const actualTaskLabel =
    model.actualTaskCount === null ? "실행 확인 중" : `실행 ${model.actualTaskCount}개`;
  const expectedTaskLabel =
    model.expectedTaskCount === null ? "예상 계산 중" : `예상 ${model.expectedTaskCount}개`;
  const sessionLabel = getSessionLabel(model.sessionStatus);
  const observationNote = getObservationNote(model.sessionStatus);

  return (
    <section
      aria-label="CloudWatch 기반 지표"
      className={styles.telemetrySummary}
      data-provider-state={model.providerState}
      data-session-status={model.sessionStatus ?? "not_started"}
      data-testid="live-observation-telemetry"
    >
      <header className={styles.telemetryHeader}>
        <div>
          <p className={styles.eyebrow}>AWS 운영 지표</p>
          <h2>CloudWatch 기반 지표</h2>
        </div>
        {sessionLabel ? (
          <span className={styles.telemetryProviderState}>{sessionLabel}</span>
        ) : null}
      </header>
      <div className={styles.telemetryGrid}>
        <TelemetryMetric
          label="요청량"
          value={`${Math.round(model.projectedRequestsPerMinute)} req/min · ${getPressureLabel(model.pressureLevel)}`}
        />
        <TelemetryMetric label="ECS Task" value={`${actualTaskLabel} · ${expectedTaskLabel}`} />
        <TelemetryMetric label="수집 상태" value={getProviderLabel(model.providerState)} />
      </div>
      {observationNote ? <p className={styles.telemetryNote}>{observationNote}</p> : null}
      {aiError ? (
        <p className={styles.telemetryError}>개선안 생성 상태: {aiError}</p>
      ) : null}
    </section>
  );
});

function TelemetryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.telemetryMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getSessionLabel(
  status: LiveObservationV2Snapshot["status"] | "not_started" | null
): string | null {
  if (status === "stopped") return "관측 종료";
  if (status === "expired") return "관측 만료";
  return null;
}

function getObservationNote(
  status: LiveObservationV2Snapshot["status"] | "not_started" | null
): string | null {
  if (status === "stopped") return "관측이 종료되어 마지막으로 확인한 값입니다.";
  if (status === "expired") return "관측 시간이 만료되어 마지막으로 확인한 값입니다.";
  return null;
}

function getPressureLabel(level: LiveObservationV2Snapshot["live"]["pressureLevel"]): string {
  if (level === "critical") return "위험";
  if (level === "high") return "높음";
  if (level === "warning") return "주의";
  return "정상";
}

function getProviderLabel(
  state: ReturnType<typeof createLiveObservationTelemetryModel>["providerState"]
): string {
  if (state === "available") return "정상 수집";
  if (state === "delayed" || state === "unavailable") return "수집 지연";
  return "수집 대기";
}
