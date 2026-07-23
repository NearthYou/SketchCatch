import React, { type ReactNode } from "react";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import styles from "./live-observation-signal-dashboard.module.css";

/** Keeps observed facts, cautious inferences, and missing information in visibly separate groups. */
export function LiveObservationEvidencePanel({
  signal
}: {
  readonly signal: LiveObservationSignal;
}) {
  return (
    <section aria-labelledby="live-observation-evidence-heading" className={styles.evidencePanel}>
      <h3 id="live-observation-evidence-heading">확인한 내용</h3>
      <EvidenceGroup label="확인된 사실">
        {signal.evidence.map((evidence) => (
          <li key={evidence.id}>{evidence.detail}</li>
        ))}
      </EvidenceGroup>
      <EvidenceGroup label="가능성이 높은 원인">
        {signal.possibleCauses.length > 0 ? (
          signal.possibleCauses.map((cause) => <li key={cause.text}>{cause.text}</li>)
        ) : (
          <li>원인은 아직 확인하지 못했어요.</li>
        )}
      </EvidenceGroup>
      {signal.unknowns.length > 0 ? (
        <EvidenceGroup label="아직 확인할 수 없는 부분">
          {signal.unknowns.map((unknown) => (
            <li key={unknown.text}>{unknown.text}</li>
          ))}
        </EvidenceGroup>
      ) : null}
    </section>
  );
}

/** Keeps each evidence level visibly separate so a user does not confuse a fact with an inference or a missing value. */
function EvidenceGroup({
  children,
  label
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div className={styles.evidenceGroup}>
      <h4>{label}</h4>
      <ul>{children}</ul>
    </div>
  );
}
