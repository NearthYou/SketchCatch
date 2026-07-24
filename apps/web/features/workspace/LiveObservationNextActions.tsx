import React from "react";
import styles from "./live-observation-signal-dashboard.module.css";

export type LiveObservationRecommendedAction = {
  readonly actionLabel: string;
  readonly boundary: string;
  readonly description: string;
  readonly errorMessage?: string | undefined;
  readonly explanation?: string | undefined;
  readonly isApplying: boolean;
  readonly isLoading: boolean;
  readonly onAction?: (() => void) | undefined;
  readonly title: string;
};

/** Keeps investigation guidance and the one real, user-approved draft action in the same decision area. */
export function LiveObservationNextActions({
  recommendedAction
}: {
  readonly recommendedAction?: LiveObservationRecommendedAction | null | undefined;
}) {
  if (!recommendedAction) return null;

  return (
    <section aria-labelledby="live-observation-next-actions-heading" className={styles.nextActions}>
      <h3 id="live-observation-next-actions-heading">다음 행동</h3>
      <div className={styles.recommendedAction}>
        <strong>{recommendedAction.title}</strong>
        <p>{recommendedAction.description}</p>
        {recommendedAction.explanation ? (
          <p className={styles.recommendedActionExplanation}>
            AI 분석: {recommendedAction.explanation}
          </p>
        ) : null}
        {recommendedAction.isLoading ? <p role="status">수정안을 준비하고 있어요.</p> : null}
        {recommendedAction.errorMessage ? (
          <p className={styles.recommendedActionError} role="alert">
            수정안을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        ) : null}
        {recommendedAction.onAction ? (
          <button
            className={styles.recommendedActionButton}
            disabled={recommendedAction.isApplying}
            onClick={recommendedAction.onAction}
            type="button"
          >
            {recommendedAction.isApplying
              ? "수정안을 저장하고 있어요..."
              : getActionLabel(recommendedAction.actionLabel)}
          </button>
        ) : null}
        <small>{recommendedAction.boundary}</small>
      </div>
    </section>
  );
}

/** Replaces an internal draft name with the user-visible action while preserving other real actions. */
function getActionLabel(value: string): string {
  return /Project Draft/i.test(value) ? "수정안 저장" : value;
}
