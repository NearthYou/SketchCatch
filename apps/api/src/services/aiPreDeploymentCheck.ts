import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import {
  analyzePreDeployment,
  mergePreDeploymentAnalysisFindings
} from "./aiPreDeploymentAnalysis.js";
import {
  createConfiguredTerraformSecurityScanner,
  type TerraformSecurityScanner
} from "./terraform/trivy-terraform-scan.js";

export type AnalyzePreDeploymentCheckInput = {
  readonly architectureJson: ArchitectureJson;
  readonly terraformFiles?: readonly TerraformSyncFileInput[] | undefined;
};

export type AnalyzePreDeploymentCheck = (
  input: AnalyzePreDeploymentCheckInput
) => Promise<AiPreDeploymentAnalysisResult>;

export type AnalyzePreDeploymentCheckOptions = {
  readonly terraformSecurityScanner?: TerraformSecurityScanner | undefined;
};

export async function analyzePreDeploymentCheck(
  input: AnalyzePreDeploymentCheckInput,
  options: AnalyzePreDeploymentCheckOptions = {}
): Promise<AiPreDeploymentAnalysisResult> {
  const terraformFiles = getNonEmptyTerraformFiles(input.terraformFiles ?? []);

  if (terraformFiles.length === 0) {
    return analyzePreDeployment(input.architectureJson);
  }

  const terraformSecurityScanner =
    options.terraformSecurityScanner ?? createConfiguredTerraformSecurityScanner();
  const [policyAnalysis, terraformSecurityFindings] = await Promise.all([
    Promise.resolve(
      analyzePreDeployment(input.architectureJson, {
        includeArchitectureSecurityFindings: false
      })
    ),
    terraformSecurityScanner({ terraformFiles })
  ]);

  return mergePreDeploymentAnalysisFindings(policyAnalysis, terraformSecurityFindings);
}

function getNonEmptyTerraformFiles(
  terraformFiles: readonly TerraformSyncFileInput[]
): TerraformSyncFileInput[] {
  return terraformFiles.filter((file) => file.terraformCode.trim().length > 0);
}
