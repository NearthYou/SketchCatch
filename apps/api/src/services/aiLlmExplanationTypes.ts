import type {
  AiArchitectureDraftResult,
  AiTerraformPreviewExplanationResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  ArchitecturePatchPreview,
  DesignSimulationResult,
  LlmExplanation
} from "@sketchcatch/types";

export type LlmExplanationInput =
  | {
      readonly target: "architecture_draft";
      readonly result: AiArchitectureDraftResult;
      readonly requirementPromptText?: string | undefined;
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
      readonly terraformCodeContext?: string | undefined;
    }
  | {
      readonly target: "terraform_preview_explanation";
      readonly result: AiTerraformPreviewExplanationResult;
    }
  | {
      readonly target: "architecture_patch_preview";
      readonly result: ArchitecturePatchPreview;
    };

export type CreateLlmExplanation = (input: LlmExplanationInput) => Promise<LlmExplanation>;
