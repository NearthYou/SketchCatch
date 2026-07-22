import type {
  AiPreDeploymentAnalysisResult,
  CheckFinding,
  CostEstimatePeriod,
  DesignSimulationBottleneck,
  DesignSimulationFailureScenario,
  DesignSimulationResult,
  MoneyEstimate
} from "@sketchcatch/types";

export type WorkspaceDesignAnalysisPresentation = {
  readonly summary: string;
  readonly assumptions: readonly string[];
  readonly bottlenecks: readonly DesignSimulationBottleneck[];
  readonly failureScenarios: readonly DesignSimulationFailureScenario[];
  readonly securityRisks: readonly CheckFinding[];
  readonly costEstimate: (MoneyEstimate & { readonly period: CostEstimatePeriod }) | null;
  readonly costReviewItems: readonly string[];
  readonly recommendations: readonly string[];
};

export function createWorkspaceDesignAnalysisPresentation(
  simulation: DesignSimulationResult,
  preDeployment: AiPreDeploymentAnalysisResult
): WorkspaceDesignAnalysisPresentation {
  const securityRisks = preDeployment.findings.filter(
    (finding) => finding.category === "security"
  );
  const simulationCost = simulation.costEstimate;
  const costEstimate = simulationCost
    ? {
        ...simulationCost.totalEstimate,
        period: simulationCost.period
      }
    : {
        amount: preDeployment.totalMonthlyEstimate.amount,
        currency: preDeployment.totalMonthlyEstimate.currency,
        period: "month" as const
      };
  const recommendations = uniqueText([
    ...simulation.recommendations,
    ...preDeployment.suggestions.map(
      (suggestion) => `${suggestion.title}: ${suggestion.explanation}`
    )
  ]);

  return {
    assumptions: simulation.assumptions,
    bottlenecks: simulation.bottlenecks,
    costEstimate,
    costReviewItems:
      simulationCost && simulationCost.reviewMessages.length > 0
        ? simulationCost.reviewMessages
        : simulation.costPressure,
    failureScenarios: simulation.failureScenarios,
    recommendations,
    securityRisks,
    summary: simulation.summary
  };
}

function uniqueText(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))];
}
