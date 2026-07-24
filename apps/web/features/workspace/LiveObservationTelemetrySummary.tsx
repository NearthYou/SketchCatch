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
      aria-label="인프라 설계 판단"
      className={styles.telemetrySummary}
      data-session-status={model.sessionStatus ?? "not_started"}
      data-testid="live-observation-telemetry"
    >
      <header className={styles.telemetryHeader}>
        <div>
          <p className={styles.eyebrow}>관측 기반</p>
          <h2>인프라 설계 판단</h2>
        </div>
        {sessionLabel ? (
          <span className={styles.telemetryProviderState}>{sessionLabel}</span>
        ) : null}
      </header>
      <div className={styles.telemetryGrid}>
        <TelemetryMetric
          label="예상 부하"
          value={`${Math.round(model.projectedRequestsPerMinute)} req/min · ${getPressureLabel(model.pressureLevel)}`}
        />
        <TelemetryMetric label="Task 변화" value={`${actualTaskLabel} · ${expectedTaskLabel}`} />
        <TelemetryMetric label="설계 분석" value={getAiLabel(model.aiState)} />
      </div>
      {observationNote ? <p className={styles.telemetryNote}>{observationNote}</p> : null}
      {aiError ? <p className={styles.telemetryError}>{aiError}</p> : null}
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

function getAiLabel(state: LiveObservationAiState): string {
  if (state === "loading") return "분석 중";
  if (state === "ready") return "분석 완료";
  if (state === "error") return "분석 실패";
  return "대기 중";
}
