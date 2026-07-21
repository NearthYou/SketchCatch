import React from "react";
import { AlertTriangle, CircleAlert } from "lucide-react";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import styles from "./live-observation-signal-dashboard.module.css";

/** Lets a user choose one of the bounded important signals without triggering an infrastructure action. */
export function LiveObservationSignalCards({
  onSelect,
  selectedSignalId,
  signals
}: {
  readonly onSelect: (signalId: string) => void;
  readonly selectedSignalId: string | null;
  readonly signals: readonly LiveObservationSignal[];
}) {
  if (signals.length === 0) return null;

  return (
    <section
      aria-labelledby="live-observation-signals-heading"
      className={styles.signalCardsSection}
    >
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>지금 확인할 내용</p>
          <h2 id="live-observation-signals-heading">중요 신호</h2>
        </div>
        <span className={styles.signalCount}>{signals.length}개</span>
      </div>
      <div className={styles.signalCards}>
        {signals.map((signal) => {
          const isSelected = signal.id === selectedSignalId;
          return (
            <button
              aria-pressed={isSelected}
              className={styles.signalCard}
              data-selected={isSelected}
              data-status={signal.status}
              key={signal.id}
              onClick={() => onSelect(signal.id)}
              type="button"
            >
              <span className={styles.signalCardTopline}>
                <span className={styles.signalStatus}>
                  {signal.status === "critical" ? (
                    <CircleAlert aria-hidden="true" size={15} />
                  ) : (
                    <AlertTriangle aria-hidden="true" size={15} />
                  )}
                  {getSignalStatusLabel(signal.status)}
                </span>
                {signal.currentValue ? <strong>{signal.currentValue}</strong> : null}
              </span>
              <span className={styles.signalTitle}>{signal.title}</span>
              <span className={styles.signalImportance}>{signal.importance}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Uses text beside an icon so warning and problem cards remain distinguishable without color. */
function getSignalStatusLabel(status: LiveObservationSignal["status"]): string {
  return status === "critical" ? "문제 발생" : "주의";
}
