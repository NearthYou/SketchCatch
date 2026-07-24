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
import {
  EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER,
  reconcileLiveObservationSignalLedger
} from "./live-observation-signal-ledger";
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
  const [signalLedger, setSignalLedger] = useState(EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER);
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
  const visibleSignals = useMemo(
    () => reconcileLiveObservationSignalLedger(signalLedger, snapshot, model.signals).signals,
    [model.signals, signalLedger, snapshot]
  );
  const selectedSignal =
    visibleSignals.find((signal) => signal.id === selectedSignalId) ?? visibleSignals[0] ?? null;

  useEffect(() => {
    setSignalLedger((current) =>
      reconcileLiveObservationSignalLedger(current, snapshot, model.signals)
    );
  }, [model.signals, snapshot]);

  // Preserve the selected observation record while it remains in this session's stable ledger.
  useEffect(() => {
    setSelectedSignalId((current) =>
      current && visibleSignals.some((signal) => signal.id === current)
        ? current
        : (visibleSignals[0]?.id ?? null)
    );
  }, [visibleSignals]);

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
        signals={visibleSignals}
      />
      {selectedSignal ? (
        <LiveObservationSignalDetail
          recommendedAction={recommendedAction}
          signal={selectedSignal}
        />
      ) : recommendedAction ? (
        <LiveObservationNextActions recommendedAction={recommendedAction} />
      ) : null}
    </section>
  );
}
