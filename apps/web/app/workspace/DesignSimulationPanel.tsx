import type { DesignSimulationResult } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type DesignSimulationPanelProps = {
  readonly designSimulation: DesignSimulationResult | null;
  readonly isDisabled: boolean;
  readonly onDesignSimulation: () => void;
};

// Design Simulation 결과를 Pre-Deployment Check와 섞지 않고 별도 패널로 보여줍니다.
export function DesignSimulationPanel({
  designSimulation,
  isDisabled,
  onDesignSimulation
}: DesignSimulationPanelProps) {
  return (
    <section className="workspacePanel resultPanel">
      <h2>Design Simulation</h2>
      {designSimulation === null ? (
        <p className="emptyState">Architecture Draft 생성 후 요청 흐름, 병목, 장애 시나리오를 추정할 수 있습니다.</p>
      ) : (
        <div className="resultStack">
          <p className="resultTitle">{designSimulation.summary}</p>
          <ResultList
            items={designSimulation.requestFlow.map((step) => ({
              id: `${step.fromResourceId}-${step.toResourceId}`,
              label: `${step.fromResourceId} -> ${step.toResourceId}`,
              text: step.description
            }))}
            summary="요청 흐름"
          />
          <ResultList
            items={designSimulation.bottlenecks.map((item) => ({
              id: item.id,
              label: `${item.severity.toUpperCase()} · ${item.title}`,
              text: item.description
            }))}
            summary="병목 후보"
          />
          <ResultList
            items={designSimulation.failureScenarios.map((item) => ({
              id: item.id,
              label: item.title,
              text: `${item.description} ${item.mitigation}`
            }))}
            summary="장애 시나리오"
          />
          <ResultList
            items={[
              ...designSimulation.costPressure.map((item) => ({
                id: `cost-${item}`,
                label: "비용 압박",
                text: item
              })),
              ...designSimulation.recommendations.map((item) => ({
                id: `recommendation-${item}`,
                label: "추천 검토",
                text: item
              }))
            ]}
            summary="비용과 다음 검토"
          />
        </div>
      )}
      <button className="primaryButton" disabled={isDisabled} onClick={onDesignSimulation}>
        Design Simulation 실행
      </button>
    </section>
  );
}
