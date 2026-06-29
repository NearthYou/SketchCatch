import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureSuggestion,
  ChecklistItem,
  CheckFinding
} from "@sketchcatch/types";
import { LlmExplanationPanel } from "./LlmExplanationPanel";
import { ResultList } from "./ResultList";

type PreDeploymentAnalysisPanelProps = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
};

type PreDeploymentResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

// 배포 전 점검 결과 표시만 맡아 Architecture Draft 입력 흐름과 UI 책임을 나눕니다.
export function PreDeploymentAnalysisPanel({ analysis }: PreDeploymentAnalysisPanelProps) {
  return (
    <section className="workspacePanel resultPanel">
      <h2>비용/보안 점검</h2>
      {analysis === null ? (
        <p className="emptyState">Architecture Draft 생성 후 사전 점검을 실행하면 finding과 checklist가 나옵니다.</p>
      ) : (
        <div className="resultStack">
          <LlmExplanationPanel explanation={analysis.llmExplanation} />
          <ResultList
            items={createPreDeploymentFindingItems(analysis.findings)}
            summary={analysis.summary}
          />
          <ResultList items={createPreDeploymentChecklistItems(analysis.checklist)} summary="체크리스트" />
          <ResultList
            items={createPreDeploymentSuggestionItems(analysis.suggestions)}
            summary="수정 제안"
          />
        </div>
      )}
    </section>
  );
}

// finding이 보드 Resource와 연결되는지 화면에서 바로 확인할 수 있게 문장을 보강합니다.
export function createPreDeploymentFindingItems(
  findings: readonly CheckFinding[]
): PreDeploymentResultItem[] {
  return findings.map((finding) => ({
    id: finding.id,
    label: `${finding.severity.toUpperCase()} · ${finding.title}`,
    text: finding.resourceId
      ? `${finding.description} 연결 Resource: ${finding.resourceId}`
      : finding.description
  }));
}

// checklist가 어떤 finding을 확인해야 하는지 잃어버리지 않게 연결 id를 같이 보여줍니다.
export function createPreDeploymentChecklistItems(
  checklist: readonly ChecklistItem[]
): PreDeploymentResultItem[] {
  return checklist.map((item) => ({
    id: item.id,
    label: `${item.status.toUpperCase()} · ${item.label}`,
    text:
      item.relatedFindingIds.length === 0
        ? "연결 finding 없음"
        : `연결 finding: ${item.relatedFindingIds.join(", ")}`
  }));
}

// suggestion은 자동 적용이 아니므로 대상 Resource와 원본 finding을 검토 정보로 함께 표시합니다.
export function createPreDeploymentSuggestionItems(
  suggestions: readonly ArchitectureSuggestion[]
): PreDeploymentResultItem[] {
  return suggestions.map((suggestion) => {
    const reviewLinks = [
      suggestion.targetResourceId ? `대상 Resource: ${suggestion.targetResourceId}` : undefined,
      suggestion.findingId ? `연결 finding: ${suggestion.findingId}` : undefined
    ].filter((item): item is string => item !== undefined);

    return {
      id: suggestion.id,
      label: `${suggestion.action} · ${suggestion.title}`,
      text:
        reviewLinks.length === 0
          ? suggestion.explanation
          : `${suggestion.explanation} ${reviewLinks.join(" · ")}`
    };
  });
}
