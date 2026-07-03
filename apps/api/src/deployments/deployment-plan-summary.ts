import type { DeploymentPlanSummary, DeploymentPlanWarning } from "@sketchcatch/types";

type TerraformShowJson = {
  resource_changes?: unknown;
};

type TerraformResourceChange = {
  address?: unknown;
  mode?: unknown;
  type?: unknown;
  change?: {
    actions?: unknown;
  };
};

export const liveApplySupportedResourceTypes = new Set([
  "aws_vpc",
  "aws_subnet",
  "aws_internet_gateway",
  "aws_route_table",
  "aws_route_table_association",
  "aws_security_group",
  "aws_security_group_rule",
  "aws_instance",
  "aws_s3_bucket"
]);

export class DeploymentPlanSummaryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentPlanSummaryParseError";
  }
}

export function createDeploymentPlanSummaryFromTerraformShowJson(
  terraformShowJson: string
): DeploymentPlanSummary {
  const parsed = parseTerraformShowJson(terraformShowJson);
  const warnings: DeploymentPlanWarning[] = [];
  const summary: DeploymentPlanSummary = {
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings
  };

  const resourceChanges = Array.isArray(parsed.resource_changes) ? parsed.resource_changes : [];

  for (const resourceChange of resourceChanges) {
    if (!isTerraformResourceChange(resourceChange)) {
      continue;
    }

    const actions = resourceChange.change?.actions;

    if (!Array.isArray(actions) || !actions.every((action) => typeof action === "string")) {
      warnings.push(createUnknownActionWarning(resourceChange.address, "missing actions"));
      continue;
    }

    if (isSameActions(actions, ["create"])) {
      summary.createCount += 1;
      continue;
    }

    if (isSameActions(actions, ["update"])) {
      summary.updateCount += 1;
      continue;
    }

    if (isSameActions(actions, ["delete"])) {
      summary.deleteCount += 1;
      continue;
    }

    if (isSameActions(actions, ["delete", "create"]) || isSameActions(actions, ["create", "delete"])) {
      summary.replaceCount += 1;
      continue;
    }

    if (isSameActions(actions, ["no-op"]) || isSameActions(actions, ["read"])) {
      continue;
    }

    warnings.push(createUnknownActionWarning(resourceChange.address, actions.join(",")));
  }

  return summary;
}

export function findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
  terraformShowJson: string
): string[] {
  const parsed = parseTerraformShowJson(terraformShowJson);
  const resourceChanges = Array.isArray(parsed.resource_changes) ? parsed.resource_changes : [];
  const unsupportedTypes = new Set<string>();

  for (const resourceChange of resourceChanges) {
    if (!isTerraformResourceChange(resourceChange) || resourceChange.mode === "data") {
      continue;
    }

    const resourceType = resourceChange.type;

    if (typeof resourceType !== "string" || resourceType.trim().length === 0) {
      continue;
    }

    const actions = resourceChange.change?.actions;

    if (
      Array.isArray(actions) &&
      actions.every((action) => typeof action === "string") &&
      (isSameActions(actions, ["no-op"]) || isSameActions(actions, ["read"]))
    ) {
      continue;
    }

    if (!liveApplySupportedResourceTypes.has(resourceType)) {
      unsupportedTypes.add(resourceType);
    }
  }

  return [...unsupportedTypes].sort((left, right) => left.localeCompare(right));
}

function isTerraformResourceChange(value: unknown): value is TerraformResourceChange {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTerraformShowJson(terraformShowJson: string): TerraformShowJson {
  try {
    const parsed: unknown = JSON.parse(terraformShowJson);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new DeploymentPlanSummaryParseError("Terraform plan JSON must be an object");
    }

    return parsed as TerraformShowJson;
  } catch (error) {
    if (error instanceof DeploymentPlanSummaryParseError) {
      throw error;
    }

    throw new DeploymentPlanSummaryParseError("Terraform plan JSON could not be parsed");
  }
}

function isSameActions(actions: string[], expectedActions: string[]): boolean {
  return (
    actions.length === expectedActions.length &&
    actions.every((action, index) => action === expectedActions[index])
  );
}

function createUnknownActionWarning(
  resourceAddress: unknown,
  actionsDescription: string
): DeploymentPlanWarning {
  const message =
    typeof resourceAddress === "string" && resourceAddress.trim().length > 0
      ? `Unsupported Terraform plan action for ${resourceAddress}: ${actionsDescription}`
      : `Unsupported Terraform plan action: ${actionsDescription}`;

  return {
    id: `terraform_plan:UNKNOWN_TERRAFORM_ACTION:${typeof resourceAddress === "string" ? resourceAddress : "unknown"}`,
    level: "medium",
    category: "configuration",
    source: "terraform_plan",
    code: "UNKNOWN_TERRAFORM_ACTION",
    message,
    requiresAcknowledgement: true,
    blocksApproval: false
  };
}
