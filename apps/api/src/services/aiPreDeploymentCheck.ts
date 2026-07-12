import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  CheckFinding,
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
import { createRuntimeCacheFromEnv } from "../runtime-cache/index.js";
import { scanTerraformWithDeterministicGate } from "./terraform/deterministic-terraform-gate.js";

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

const defaultTerraformSecurityScanner = createConfiguredTerraformSecurityScanner({
  runtimeCache: createRuntimeCacheFromEnv()
});

export async function analyzePreDeploymentCheck(
  input: AnalyzePreDeploymentCheckInput,
  options: AnalyzePreDeploymentCheckOptions = {}
): Promise<AiPreDeploymentAnalysisResult> {
  const terraformFiles = getNonEmptyTerraformFiles(input.terraformFiles ?? []);

  if (terraformFiles.length === 0) {
    return analyzePreDeployment(input.architectureJson);
  }

  const terraformSecurityScanner =
    options.terraformSecurityScanner ?? defaultTerraformSecurityScanner;
  const [policyAnalysis, terraformSecurityFindings] = await Promise.all([
    Promise.resolve(
      analyzePreDeployment(input.architectureJson, {
        includeArchitectureSecurityFindings: false
      })
    ),
    terraformSecurityScanner({ terraformFiles })
  ]);

  const deterministicFindings = scanTerraformWithDeterministicGate(terraformFiles);
  const deepFindings = [
    ...terraformSecurityFindings,
    ...deterministicFindings.filter(
      (deterministicFinding) =>
        !terraformSecurityFindings.some(
          (trivyFinding) =>
            trivyFinding.resourceId === deterministicFinding.resourceId &&
            inferFindingRiskFamily(trivyFinding) === deterministicFinding.riskFamily
        )
    )
  ];
  return mergePreDeploymentAnalysisFindings(policyAnalysis, deepFindings);
}

function inferFindingRiskFamily(finding: CheckFinding): string | undefined {
  if (finding.riskFamily) return finding.riskFamily;

  const haystack = [
    finding.resourceId,
    finding.title,
    finding.description,
    finding.recommendation,
    ...(finding.trivyRuleIds ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("aws_security_group") && /ssh|rdp|0\.0\.0\.0\/0|::\/0/.test(haystack)) {
    return "PUBLIC_SSH";
  }
  if (haystack.includes("aws_db_instance") && /public|publicly_accessible/.test(haystack)) {
    return "PUBLIC_RDS";
  }
  if (haystack.includes("aws_iam_") && /wildcard|\baction\b.*\*/.test(haystack)) {
    return "IAM_WILDCARD";
  }
  return undefined;
}

export function analyzeImmediatePreDeploymentCheck(
  input: AnalyzePreDeploymentCheckInput
): AiPreDeploymentAnalysisResult {
  const terraformFiles = getNonEmptyTerraformFiles(input.terraformFiles ?? []);

  if (terraformFiles.length === 0) {
    return analyzePreDeployment(input.architectureJson);
  }

  const policyAnalysis = analyzePreDeployment(input.architectureJson, {
    includeArchitectureSecurityFindings: false
  });
  return mergePreDeploymentAnalysisFindings(
    policyAnalysis,
    scanTerraformWithDeterministicGate(terraformFiles)
  );
}

function getNonEmptyTerraformFiles(
  terraformFiles: readonly TerraformSyncFileInput[]
): TerraformSyncFileInput[] {
  return terraformFiles.filter((file) => file.terraformCode.trim().length > 0);
}
