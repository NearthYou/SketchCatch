import type { AiPreDeploymentAnalysisResult } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type PreDeploymentAnalysisPanelProps = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
};

// 배포 전 점검 결과 표시만 맡아 Architecture Draft 입력 흐름과 UI 책임을 나눕니다.
export function PreDeploymentAnalysisPanel({ analysis }: PreDeploymentAnalysisPanelProps) {
  return (
    <section className="workspacePanel resultPanel">
      <h2>비용/보안 점검</h2>
      {analysis === null ? (
        <p className="emptyState">Architecture Draft 생성 후 사전 점검을 실행하면 finding과 checklist가 나옵니다.</p>
      ) : (
        <ResultList
          items={analysis.findings.map((finding) => ({
            id: finding.id,
            label: `${finding.severity.toUpperCase()} · ${finding.title}`,
            text: finding.description
          }))}
          summary={analysis.summary}
        />
      )}
    </section>
  );
}
