import type { AiPreDeploymentAnalysisResult, DesignSimulationResult, LlmEnhancement } from "@sketchcatch/types";

export type LlmEnhancementInput =
  | {
      readonly target: "design_simulation";
      readonly result: DesignSimulationResult;
    }
  | {
      readonly target: "pre_deployment_check";
      readonly result: AiPreDeploymentAnalysisResult;
    };

export type CreateLlmEnhancement = (input: LlmEnhancementInput) => Promise<LlmEnhancement>;
