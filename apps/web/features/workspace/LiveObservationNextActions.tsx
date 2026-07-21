import React from "react";
import styles from "./live-observation-signal-dashboard.module.css";

/** Offers guidance only when an actual in-screen log disclosure exists; it never renders a non-working action. */
export function LiveObservationNextActions({ hasLogDetails }: { readonly hasLogDetails: boolean }) {
  if (!hasLogDetails) return null;

  return (
    <section aria-labelledby="live-observation-next-actions-heading" className={styles.nextActions}>
      <h3 id="live-observation-next-actions-heading">다음 확인</h3>
      <p>대표 로그를 열어 자세한 내용을 확인할 수 있어요.</p>
    </section>
  );
}
