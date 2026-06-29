import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  DesignSimulationResult,
  LlmExplanation
} from "@sketchcatch/types";

export type LlmExplanationInput =
  | {
      readonly target: "architecture_draft";
      readonly result: AiArchitectureDraftResult;
    }
  | {
      readonly target: "design_simulation";
      readonly result: DesignSimulationResult;
    }
  | {
      readonly target: "pre_deployment_check";
      readonly result: AiPreDeploymentAnalysisResult;
    }
  | {
      readonly target: "terraform_error_explanation";
      readonly result: AiTerraformErrorExplanationResult;
    };

export type CreateLlmExplanation = (input: LlmExplanationInput) => Promise<LlmExplanation>;
