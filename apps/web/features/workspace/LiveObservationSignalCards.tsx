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
          <h2 id="live-observation-signals-heading">관측 기록</h2>
          <p className={styles.sectionDescription}>이 세션에서 확인한 문제를 계속 표시합니다.</p>
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
                <span aria-hidden="true" className={styles.signalStatus}>
                  {signal.status === "critical" ? (
                    <CircleAlert size={15} />
                  ) : (
                    <AlertTriangle size={15} />
                  )}
                </span>
                {signal.currentValue ? <strong>{signal.currentValue}</strong> : null}
              </span>
              <span className={styles.signalTitle}>{signal.title}</span>
              <span className={styles.signalImportance}>{signal.userImpact}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
