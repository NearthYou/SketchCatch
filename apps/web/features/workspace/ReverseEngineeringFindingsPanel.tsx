import type {
  CheckFinding,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringScanError
} from "@sketchcatch/types";
import styles from "./workspace.module.css";

export type ReverseEngineeringFindingsPanelProps = {
  readonly analysisExclusions: ReverseEngineeringAnalysisExclusion[];
  readonly findings: CheckFinding[];
  readonly scanErrors: ReverseEngineeringScanError[];
};

// Reverse Engineering 결과에서 위험, 비용, 부분 실패를 한눈에 보여줍니다.
export function ReverseEngineeringFindingsPanel({
  analysisExclusions,
  findings,
  scanErrors
}: ReverseEngineeringFindingsPanelProps) {
  const highRiskCount = findings.filter((finding) => finding.severity === "high").length;

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
          <ul className={styles.reverseResultList}>
            {scanErrors.map((scanError) => (
              <li key={scanError.id} className={styles.reverseResultItem}>
                <strong>{scanError.resourceType}</strong>
                <span>{scanError.message}</span>
              </li>
            ))}
          </ul>
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
