"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ArchitectureJson, Deployment, LiveObservationV2Snapshot } from "@sketchcatch/types";
import { LiveObservationSignalCards } from "./LiveObservationSignalCards";
import { LiveObservationSignalDetail } from "./LiveObservationSignalDetail";
import { LiveObservationTelemetrySummary } from "./LiveObservationTelemetrySummary";
import {
  LiveObservationNextActions,
  type LiveObservationRecommendedAction
} from "./LiveObservationNextActions";
import { createLiveObservationSignalDashboardModel } from "./live-observation-signal-dashboard";
import { appendLiveObservationSessionHistory } from "./live-observation-session-history";
import type { LiveObservationAiState } from "./live-observation-telemetry";
import styles from "./live-observation-signal-dashboard.module.css";

/** Coordinates local session history and card selection while leaving session/SSE ownership in the modal. */
export function LiveObservationSignalDashboard({
  architecture,
  aiError,
  aiState,
  deployment,
  recommendedAction,
  snapshot
}: {
  readonly architecture?: ArchitectureJson | null | undefined;
  readonly aiError?: string | undefined;
  readonly aiState?: LiveObservationAiState | undefined;
  readonly deployment: Deployment | null;
  readonly recommendedAction?: LiveObservationRecommendedAction | null | undefined;
  readonly snapshot: LiveObservationV2Snapshot | null;
}) {
  const [history, setHistory] = useState<ReturnType<typeof appendLiveObservationSessionHistory>>(
    []
  );
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const resolvedAiState = aiState ?? "idle";

  // Keep only the current component lifetime's provider observations; a remount intentionally starts fresh.
  useEffect(() => {
    setHistory((current) => appendLiveObservationSessionHistory(current, snapshot));
  }, [snapshot]);

  const model = useMemo(
    () => createLiveObservationSignalDashboardModel({ deployment, history, snapshot }),
    [deployment, history, snapshot]
  );
  const selectedSignal =
    model.signals.find((signal) => signal.id === selectedSignalId) ?? model.signals[0] ?? null;

  // Preserve a user's selected signal while it still exists, otherwise fall back to the most important current one.
  useEffect(() => {
    setSelectedSignalId((current) =>
      current && model.signals.some((signal) => signal.id === current)
        ? current
        : (model.signals[0]?.id ?? null)
    );
  }, [model.signals]);

  return (
    <section aria-label="실시간 관측 문제" className={styles.signalDashboard}>
      <LiveObservationTelemetrySummary
        aiError={aiError}
        aiState={resolvedAiState}
        architecture={architecture ?? null}
        snapshot={snapshot}
      />
      <LiveObservationSignalCards
        onSelect={setSelectedSignalId}
        selectedSignalId={selectedSignal?.id ?? null}
        signals={model.signals}
      />
      {selectedSignal ? (
        <LiveObservationSignalDetail
          logGroups={model.logGroups}
          recommendedAction={recommendedAction}
          signal={selectedSignal}
        />
      ) : recommendedAction ? (
        <LiveObservationNextActions recommendedAction={recommendedAction} />
      ) : null}
    </section>
  );
}
