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
  hasLogDetails,
  recommendedAction
}: {
  readonly hasLogDetails: boolean;
  readonly recommendedAction?: LiveObservationRecommendedAction | null | undefined;
}) {
  if (!hasLogDetails && !recommendedAction) return null;

  return (
    <section aria-labelledby="live-observation-next-actions-heading" className={styles.nextActions}>
      <h3 id="live-observation-next-actions-heading">다음 확인</h3>
      {hasLogDetails ? <p>대표 로그를 열어 자세한 내용을 확인할 수 있어요.</p> : null}
      {recommendedAction ? (
        <div className={styles.recommendedAction}>
          <strong>{recommendedAction.title}</strong>
          <p>{recommendedAction.description}</p>
          {recommendedAction.isLoading ? (
            <p role="status">AI가 현재 상황을 확인하고 있어요.</p>
          ) : null}
          {recommendedAction.explanation ? (
            <p className={styles.recommendedActionExplanation}>{recommendedAction.explanation}</p>
          ) : null}
          {recommendedAction.errorMessage ? (
            <p className={styles.recommendedActionError} role="alert">
              {recommendedAction.errorMessage}
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
                ? "Project Draft 저장 중..."
                : recommendedAction.actionLabel}
            </button>
          ) : null}
          <small>{recommendedAction.boundary}</small>
        </div>
      ) : null}
    </section>
  );
}
