import type {
  CreateDeployedResourceRecordInput,
  CreateTerraformOutputRecordInput
} from "./deployment-service.js";

export type ExtractedDeployedResource = Omit<
  CreateDeployedResourceRecordInput,
  "id" | "deploymentId"
>;

export type ExtractedTerraformOutput = Omit<
  CreateTerraformOutputRecordInput,
  "id" | "deploymentId"
>;

type TerraformOutputJsonValue = {
  sensitive?: unknown;
  value?: unknown;
};

type TerraformStateJson = {
  values?: {
    root_module?: TerraformStateModule;
  };
};

type TerraformStateModule = {
  resources?: unknown;
  child_modules?: unknown;
};

type TerraformStateResource = {
  address?: unknown;
  mode?: unknown;
  type?: unknown;
  provider_name?: unknown;
  values?: unknown;
};

export class DeploymentApplyResultParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentApplyResultParseError";
  }
}

export function parseTerraformOutputsJson(terraformOutputJson: string): ExtractedTerraformOutput[] {
  const parsed = parseJsonObject(terraformOutputJson, "Terraform output JSON must be an object");
  const outputs: ExtractedTerraformOutput[] = [];

  for (const [name, value] of Object.entries(parsed)) {
    if (!isTerraformOutputJsonValue(value)) {
      continue;
    }

    const sensitive = value.sensitive === true;

    outputs.push({
      name,
      value: sensitive ? null : value.value ?? null,
      sensitive
    });
  }

  return outputs.sort((left, right) => left.name.localeCompare(right.name));
}

export function extractDeployedResourcesFromTerraformStateJson(
  terraformStateJson: string,
  region: string
): ExtractedDeployedResource[] {
  const parsed = parseJsonObject(terraformStateJson, "Terraform state JSON must be an object");
  const rootModule = (parsed as TerraformStateJson).values?.root_module;

  if (!isTerraformStateModule(rootModule)) {
    return [];
  }

  return collectStateResources(rootModule, region).sort((left, right) =>
    left.terraformAddress.localeCompare(right.terraformAddress)
  );
}

function collectStateResources(
  module: TerraformStateModule,
  region: string
): ExtractedDeployedResource[] {
  const resources = Array.isArray(module.resources) ? module.resources : [];
  const childModules = Array.isArray(module.child_modules) ? module.child_modules : [];
  const extractedResources: ExtractedDeployedResource[] = [];

  for (const resource of resources) {
    if (!isTerraformStateResource(resource) || resource.mode === "data") {
      continue;
    }

    const terraformAddress = typeof resource.address === "string" ? resource.address : "";
    const terraformType = typeof resource.type === "string" ? resource.type : "";

    if (!terraformAddress || !terraformType) {
      continue;
    }

    extractedResources.push({
      terraformAddress,
      terraformType,
      providerName:
        typeof resource.provider_name === "string" && resource.provider_name.length > 0
          ? resource.provider_name
          : null,
      resourceId: extractTerraformResourceId(resource.values),
      region
    });
  }

  for (const childModule of childModules) {
    if (isTerraformStateModule(childModule)) {
      extractedResources.push(...collectStateResources(childModule, region));
    }
  }

  return extractedResources;
}

function parseJsonObject(value: string, objectMessage: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DeploymentApplyResultParseError("Terraform JSON could not be parsed");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DeploymentApplyResultParseError(objectMessage);
  }

  return parsed as Record<string, unknown>;
}

function isTerraformOutputJsonValue(value: unknown): value is TerraformOutputJsonValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerraformStateModule(value: unknown): value is TerraformStateModule {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerraformStateResource(value: unknown): value is TerraformStateResource {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTerraformResourceId(values: unknown): string | null {
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    return null;
  }

  const id = (values as { id?: unknown }).id;

  if (typeof id === "string" && id.length > 0) {
    return id;
  }

  if (typeof id === "number" || typeof id === "boolean") {
    return String(id);
  }

  return null;
}
