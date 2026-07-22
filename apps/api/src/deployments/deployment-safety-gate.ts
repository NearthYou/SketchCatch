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
  findTerraformPlanChangesFromTerraformShowJson,
  type TerraformImportChange,
  type TerraformPlanChange
} from "./deployment-plan-summary.js";

export type DeploymentSafetyGateOperation = "apply" | "destroy";
export const terraformImportSafetyGateVersion = 2 as const;

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
  const expectedImportCount = input.planSummary.importCount ?? 0;
  const parsedImportCount = input.terraformShowJson
    ? findTerraformImportChangesFromTerraformShowJson(input.terraformShowJson).length
    : null;
  const importCountMatches = parsedImportCount === expectedImportCount;
  const importPlanBlock =
    input.operation === "apply" && input.terraformShowJson
      ? createTerraformImportPlanBlock(input.terraformShowJson, expectedImportCount)
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
    ...(expectedImportCount > 0 && input.terraformShowJson && importCountMatches
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

export function createTerraformImportPlanBlock(
  terraformShowJson: string,
  expectedImportCount?: number
): DeploymentBlock {
  const importChanges = findTerraformImportChangesFromTerraformShowJson(terraformShowJson);

  if (expectedImportCount !== undefined && importChanges.length !== expectedImportCount) {
    return {
      isBlocked: true,
      blockedBy: "risk_analysis",
      blockedReason: `Terraform import summary does not match the inspected plan: expected ${expectedImportCount}, found ${importChanges.length}`
    };
  }

  if (importChanges.length === 0) {
    return {
      isBlocked: false,
      blockedBy: null,
      blockedReason: null
    };
  }

  const unsafeImportChanges = importChanges.filter(
    (change) => !isSafeTerraformImportChange(change)
  );
  const unsafeCompanionChanges = findTerraformPlanChangesFromTerraformShowJson(
    terraformShowJson
  ).filter((change) => !change.isImport && !isSafeTerraformImportCompanionChange(change));

  if (unsafeImportChanges.length === 0 && unsafeCompanionChanges.length === 0) {
    return {
      isBlocked: false,
      blockedBy: null,
      blockedReason: null
    };
  }

  return {
    isBlocked: true,
    blockedBy: "risk_analysis",
    blockedReason: `Terraform import plan includes unsafe changes for existing resources: ${[
      ...unsafeImportChanges.map(formatUnsafeTerraformImportChange),
      ...unsafeCompanionChanges.map(formatUnsafeTerraformImportCompanionChange)
    ]
      .join("; ")}`
  };
}

function isSafeTerraformImportChange(change: TerraformImportChange): boolean {
  return (
    change.address !== null &&
    change.importingMetadataValid &&
    change.actions !== null &&
    isSameActions(change.actions, ["no-op"])
  );
}

function isSafeTerraformImportCompanionChange(change: TerraformPlanChange): boolean {
  return (
    change.address !== null &&
    change.actions !== null &&
    (["no-op", "read", "update"] as const).some((action) =>
      isSameActions(change.actions ?? [], [action])
    )
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

function formatUnsafeTerraformImportCompanionChange(change: TerraformPlanChange): string {
  const address = change.address ?? "unknown";

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
