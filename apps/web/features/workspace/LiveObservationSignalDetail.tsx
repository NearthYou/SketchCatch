import React from "react";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import { LiveObservationEvidencePanel } from "./LiveObservationEvidencePanel";

import {
  LiveObservationNextActions,
  type LiveObservationRecommendedAction
} from "./LiveObservationNextActions";

import styles from "./live-observation-signal-dashboard.module.css";

/** Presents a readable evidence summary and only available next checks for the selected record. */
export function LiveObservationSignalDetail({
  recommendedAction,
  signal
}: {
  readonly recommendedAction?: LiveObservationRecommendedAction | null | undefined;
  readonly signal: LiveObservationSignal;
}) {
  return (
    <section
      aria-labelledby="live-observation-signal-detail-heading"
      className={styles.signalDetail}
    >
      <div className={styles.detailIntro}>
        <p className={styles.eyebrow}>문제 상세</p>
        <h2 id="live-observation-signal-detail-heading">{signal.title}</h2>
        <p>{signal.userImpact}</p>
      </div>
      {signal.history.length >= 2 ? (
        <LiveObservationSignalSparkline points={signal.history} />
      ) : null}
      <div className={styles.detailGrid}>
        <div className={styles.detailPrimaryColumn}>
          <LiveObservationEvidencePanel signal={signal} />
        </div>
        <div className={styles.detailSecondaryColumn}>
          <LiveObservationNextActions recommendedAction={recommendedAction} />
        </div>
      </div>
    </section>
  );
}

/** Draws a small static SVG from actual in-session samples only; no line is rendered when the session lacks history. */
function LiveObservationSignalSparkline({
  points
}: {
  readonly points: LiveObservationSignal["history"];
}) {
  const pathPoints = getSparklinePoints(points);
  return (
    <figure className={styles.sparkline}>
      <figcaption>최근 확인한 값</figcaption>
      <svg aria-label="최근 값 변화" height="44" role="img" viewBox="0 0 160 44" width="160">
        <polyline
          fill="none"
          points={pathPoints}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </figure>
  );
}

/** Normalizes bounded actual points into the SVG viewport without inventing missing samples or a comparison baseline. */
function getSparklinePoints(points: LiveObservationSignal["history"]): string {
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const lastIndex = Math.max(points.length - 1, 1);

  return points
    .map((point, index) => {
      const x = (index / lastIndex) * 156 + 2;
      const y = 38 - ((point.value - minimum) / range) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
