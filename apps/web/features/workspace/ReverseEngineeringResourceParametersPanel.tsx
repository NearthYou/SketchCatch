import type { DiscoveredResource } from "@sketchcatch/types";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringResourceParametersPanelProps = {
  readonly discoveredResources: DiscoveredResource[];
};

// AWS에서 읽어온 리소스별 원본 설정을 사용자가 접어서 확인할 수 있게 보여줍니다.
export function ReverseEngineeringResourceParametersPanel({
  discoveredResources
}: ReverseEngineeringResourceParametersPanelProps) {
  if (discoveredResources.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3>리소스 파라미터</h3>
      <p className={styles.hint}>
        AWS에서 읽어온 설정값입니다. SketchCatch가 아직 보드에 다 그리지 못하는 값도 여기서 확인합니다.
      </p>
      <ul className={styles.resultList}>
        {discoveredResources.map((resource) => (
          <li key={resource.id} className={styles.resultItem}>
            <details className={styles.parameterDetails}>
              <summary className={styles.parameterSummary}>
                <strong>{resource.displayName}</strong>
                <span>
                  {resource.resourceType} · {resource.providerResourceId}
                </span>
              </summary>
              <pre className={styles.parameterCode}>
                <code>{formatResourceParameters(resource)}</code>
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

// providerParameters가 있으면 그 값을 우선 보여주고, 없으면 config 전체를 보기 좋게 정리합니다.
function formatResourceParameters(resource: DiscoveredResource): string {
  const parameters = resource.config["providerParameters"] ?? resource.config;

  return JSON.stringify(parameters, null, 2);
}
