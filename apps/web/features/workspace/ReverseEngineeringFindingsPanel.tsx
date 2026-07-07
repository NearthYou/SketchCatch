import type {
  CheckFinding,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringScanError
} from "@sketchcatch/types";
import styles from "./workspace.module.css";

export type ReverseEngineeringFindingsPanelProps = {
  readonly analysisExclusions: ReverseEngineeringAnalysisExclusion[];
  readonly findings: CheckFinding[];
  readonly onRetryScan: () => void;
  readonly scanErrors: ReverseEngineeringScanError[];
};

// Reverse Engineering 결과에서 위험, 비용, 부분 실패를 한눈에 보여줍니다.
export function ReverseEngineeringFindingsPanel({
  analysisExclusions,
  findings,
  onRetryScan,
  scanErrors
}: ReverseEngineeringFindingsPanelProps) {
  const highRiskCount = findings.filter((finding) => finding.severity === "high").length;
  const hasRetryableScanError = scanErrors.some((scanError) => scanError.retryable);

  return (
    <section className={styles.deploymentSection}>
      <h3>위험/비용 finding</h3>
      <div className={styles.deploymentPreflightStats}>
        <span>
          High Risk
          <strong>{highRiskCount}</strong>
        </span>
        <span>
          전체 finding
          <strong>{findings.length}</strong>
        </span>
        <span>
          부분 실패
          <strong>{scanErrors.length}</strong>
        </span>
      </div>

      {findings.length === 0 ? (
        <p className={styles.deploymentHint}>현재 스캔 결과에서 표시할 위험/비용 finding이 없습니다.</p>
      ) : (
        <ul className={styles.reverseResultList}>
          {findings.map((finding) => (
            <li key={finding.id} className={styles.reverseResultItem}>
              <strong>{finding.title}</strong>
              <span>
                {finding.severity} · {finding.category}
                {finding.resourceId ? ` · ${finding.resourceId}` : ""}
              </span>
              <span>{finding.description}</span>
              <span>어떻게 고치면 되나요: {finding.recommendation}</span>
            </li>
          ))}
        </ul>
      )}

      {scanErrors.length > 0 ? (
        <div className={styles.deploymentNotice}>
          <strong>부분 실패</strong>
          <p className={styles.deploymentHint}>
            일부 AWS 리소스를 읽지 못했습니다. 이 결과는 현재 AWS 상태 전체가 아닐 수 있습니다.
          </p>
          <ul className={styles.reverseResultList}>
            {scanErrors.map((scanError, index) => (
              <li key={`${scanError.id}-${index}`} className={styles.reverseResultItem}>
                <strong>{scanError.resourceType}</strong>
                <span>
                  stage: {scanError.stage} · reason: {scanError.reason} · retryable:{" "}
                  {formatRetryableStatus(scanError.retryable)}
                </span>
                <span>{scanError.message}</span>
              </li>
            ))}
          </ul>
          {hasRetryableScanError ? (
            <button className={styles.deploymentSecondaryButton} onClick={onRetryScan} type="button">
              다시 시도 가능 - 다시 스캔
            </button>
          ) : null}
        </div>
      ) : null}

      {analysisExclusions.length > 0 ? (
        <div className={styles.deploymentNotice}>
          <strong>지원 제외 리소스</strong>
          <ul className={styles.reverseResultList}>
            {analysisExclusions.map((exclusion) => (
              <li key={exclusion.id} className={styles.reverseResultItem}>
                <strong>{exclusion.resourceId}</strong>
                <span>{exclusion.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// retryable 값이 사용자가 바로 이해할 수 있는 말로 보이게 바꿉니다.
function formatRetryableStatus(retryable: boolean): string {
  return retryable ? "다시 시도 가능" : "다시 시도 어려움";
}
