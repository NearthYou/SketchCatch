import type {
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  DesignSimulationResult,
  LlmEnhancement
} from "@sketchcatch/types";

export type LlmEnhancementInput =
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

export type CreateLlmEnhancement = (input: LlmEnhancementInput) => Promise<LlmEnhancement>;
