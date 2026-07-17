import type {
  CheckFinding,
  DiscoveredResource,
  ReverseEngineeringAnalysisExclusion
} from "@sketchcatch/types";
import { presentReverseEngineeringResource } from "./reverse-engineering-presentation";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringFindingsPanelProps = {
  readonly analysisExclusions: ReverseEngineeringAnalysisExclusion[];
  readonly findings: CheckFinding[];
  readonly resources: readonly DiscoveredResource[];
};

// 스캔 결과에서 찾은 위험과 비용 정보를 읽기 전용 목록으로 보여줍니다.
export function ReverseEngineeringFindingsPanel({
  analysisExclusions,
  findings,
  resources
}: ReverseEngineeringFindingsPanelProps) {
  const highRiskCount = findings.filter((finding) => finding.severity === "high").length;
  const resourceNames = new Map(
    resources.map((resource) => [resource.id, presentReverseEngineeringResource(resource).displayName])
  );

  return (
    <section className={styles.section}>
      <h3>위험/비용 finding</h3>
      <div className={styles.stats}>
        <span>
          높은 위험
          <strong>{highRiskCount}</strong>
        </span>
        <span>
          전체 finding
          <strong>{findings.length}</strong>
        </span>
        <span>
          지원 제외
          <strong>{analysisExclusions.length}</strong>
        </span>
      </div>

      {findings.length === 0 ? (
        <p className={styles.hint}>현재 스캔 결과에서 표시할 위험/비용 finding이 없습니다.</p>
      ) : (
        <ul className={styles.resultList}>
          {findings.map((finding) => (
            <li key={finding.id} className={styles.resultItem}>
              <strong>{finding.title}</strong>
              <span>
                {formatFindingSeverity(finding.severity)} · {formatFindingCategory(finding.category)}
                {finding.resourceId ? ` · ${getResourceName(finding.resourceId, resourceNames)}` : ""}
              </span>
              <span>{finding.description}</span>
              <span>어떻게 고치면 되나요: {finding.recommendation}</span>
              <details className={styles.diagnosticDetails}>
                <summary>진단 정보</summary>
                <span>
                  severity: {finding.severity} · category: {finding.category}
                </span>
              </details>
            </li>
          ))}
        </ul>
      )}

      {analysisExclusions.length > 0 ? (
        <div className={styles.warning}>
          <strong>지원 제외 리소스</strong>
          <ul className={styles.resultList}>
            {analysisExclusions.map((exclusion) => (
              <li key={exclusion.id} className={styles.resultItem}>
                <strong>{getResourceName(exclusion.resourceId, resourceNames)}</strong>
                <span>{exclusion.message}</span>
                <details className={styles.diagnosticDetails}>
                  <summary>진단 정보</summary>
                  <span>reason: {exclusion.reason}</span>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function getResourceName(resourceId: string, resourceNames: ReadonlyMap<string, string>): string {
  return resourceNames.get(resourceId) ?? "연결된 AWS Resource";
}

function formatFindingSeverity(severity: CheckFinding["severity"]): string {
  return severity === "high" ? "높음" : severity === "medium" ? "주의" : "참고";
}

function formatFindingCategory(category: CheckFinding["category"]): string {
  const labels: Readonly<Record<CheckFinding["category"], string>> = {
    availability: "가용성",
    configuration: "구성",
    cost: "비용",
    network: "네트워크",
    performance: "성능",
    permission: "권한",
    security: "보안"
  };

  return labels[category];
}
