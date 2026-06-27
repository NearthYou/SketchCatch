import type { DesignSimulationRequestFlowStep, DesignSimulationResult } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type DesignSimulationPanelProps = {
  readonly designSimulation: DesignSimulationResult | null;
  readonly isDisabled: boolean;
  readonly onDesignSimulation: () => void;
};

type DesignSimulationResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

type CostReviewInput = {
  readonly costPressure: readonly string[];
  readonly recommendations: readonly string[];
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
            items={createRequestFlowItems(designSimulation.requestFlow)}
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
            items={createCostReviewItems(designSimulation)}
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

export function createRequestFlowItems(
  requestFlow: readonly DesignSimulationRequestFlowStep[]
): DesignSimulationResultItem[] {
  return requestFlow.map((step, index) => ({
    id: `${step.fromResourceId}-${step.toResourceId}-${index}`,
    label: `${step.fromResourceId} -> ${step.toResourceId}`,
    text: step.description
  }));
}

export function createCostReviewItems(input: CostReviewInput): DesignSimulationResultItem[] {
  return [
    ...input.costPressure.map((item, index) => ({
      id: `cost-${index}`,
      label: "비용 압박",
      text: item
    })),
    ...input.recommendations.map((item, index) => ({
      id: `recommendation-${index}`,
      label: "추천 검토",
      text: item
    }))
  ];
}
