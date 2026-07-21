import type {
  CheckFinding,
  DeploymentBlock,
  DeploymentLiveProfile,
  DeploymentPlanSummary,
  DeploymentPlanWarning
} from "@sketchcatch/types";
import {
  createPreDeploymentCheckWarning,
  createTerraformPlanWarnings,
  deduplicateDeploymentPlanWarnings
} from "./deployment-warning-factory.js";
import {
  findTerraformImportChangesFromTerraformShowJson,
  type TerraformImportChange
} from "./deployment-plan-summary.js";

export type DeploymentSafetyGateOperation = "apply" | "destroy";
export const terraformImportSafetyGateVersion = 1 as const;

export type EvaluateDeploymentSafetyGateInput = {
  operation: DeploymentSafetyGateOperation;
  planSummary: DeploymentPlanSummary;
  liveProfile?: DeploymentLiveProfile | undefined;
  findings?: readonly CheckFinding[];
  unsupportedResourceTypes?: readonly string[];
  warnings?: readonly DeploymentPlanWarning[];
  terraformShowJson?: string | undefined;
};

export function evaluateDeploymentSafetyGate(
  input: EvaluateDeploymentSafetyGateInput
): DeploymentPlanSummary {
  const importPlanBlock =
    input.operation === "apply" && input.terraformShowJson
      ? createTerraformImportPlanBlock(input.terraformShowJson)
      : null;
  const warnings = deduplicateDeploymentPlanWarnings([
    ...input.planSummary.warnings,
    ...(input.findings ?? []).map((finding) =>
      createPreDeploymentCheckWarning(finding, {
        liveProfile: input.liveProfile
      })
    ),
    ...createTerraformPlanWarnings({
      operation: input.operation,
      summary: input.planSummary,
      unsupportedResourceTypes: input.unsupportedResourceTypes ?? []
    }),
    ...(input.warnings ?? [])
  ]);

  return {
    ...input.planSummary,
    ...((input.planSummary.importCount ?? 0) > 0 && input.terraformShowJson
      ? { importSafetyGateVersion: terraformImportSafetyGateVersion }
      : {}),
    blocked: input.planSummary.blocked || importPlanBlock?.isBlocked === true,
    warnings
  };
}

export function requiresTerraformImportSafetyReplan(
  planSummary: DeploymentPlanSummary
): boolean {
  return (
    (planSummary.importCount ?? 0) > 0 &&
    planSummary.importSafetyGateVersion !== terraformImportSafetyGateVersion
  );
}

export function createTerraformImportPlanBlock(terraformShowJson: string): DeploymentBlock {
  const unsafeImportChanges = findTerraformImportChangesFromTerraformShowJson(
    terraformShowJson
  ).filter((change) => !isSafeTerraformImportChange(change));

  if (unsafeImportChanges.length === 0) {
    return {
      isBlocked: false,
      blockedBy: null,
      blockedReason: null
    };
  }

  return {
    isBlocked: true,
    blockedBy: "risk_analysis",
    blockedReason: `Terraform import plan includes unsafe changes for existing resources: ${unsafeImportChanges
      .map(formatUnsafeTerraformImportChange)
      .join("; ")}`
  };
}

function isSafeTerraformImportChange(change: TerraformImportChange): boolean {
  return (
    change.address !== null &&
    change.importingMetadataValid &&
    change.actions !== null &&
    (isSameActions(change.actions, ["no-op"]) || isSameActions(change.actions, ["update"]))
  );
}

function formatUnsafeTerraformImportChange(change: TerraformImportChange): string {
  const address = change.address ?? "unknown";

  if (!change.importingMetadataValid && change.actions === null) {
    return `${address} [malformed importing/actions]`;
  }

  if (!change.importingMetadataValid) {
    return `${address} [malformed importing]`;
  }

  if (change.actions === null) {
    return `${address} [malformed actions]`;
  }

  return `${address} [${change.actions.join(",") || "no actions"}]`;
}

function isSameActions(actions: readonly string[], expected: readonly string[]): boolean {
  return (
    actions.length === expected.length &&
    actions.every((action, index) => action === expected[index])
  );
}
