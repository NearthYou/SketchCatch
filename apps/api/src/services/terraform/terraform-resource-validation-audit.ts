import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CloudProvider,
  DiagramJson,
  DiagramNode,
  ResourceItem,
  ResourceParameterDefinition,
  TerraformBlockType
} from "@sketchcatch/types";
import {
  createTerraformParameterCatalogKey,
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  type ResourceDefinition
} from "@sketchcatch/types/resource-definitions";
import {
  runTerraformInit,
  runTerraformProvidersSchemaJson,
  runTerraformValidate,
  type RunTerraformCommandOptions,
  type TerraformRunResult
} from "../../deployments/terraform-runner.js";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

const providerAddress = "registry.terraform.io/hashicorp/aws";
const kubernetesProviderAddress = "registry.terraform.io/hashicorp/kubernetes";
const defaultProviderVersion = "6.51.0";
const defaultArchiveProviderVersion = "~> 2.0";
const defaultKubernetesProviderVersion = "~> 2.0";
const defaultProviderRegion = "ap-northeast-2";
const defaultTerraformAuditOutputMaxBytes = 200 * 1024 * 1024;
const defaultTerraformTimeoutMs = 300_000;
const areaResourceTypes = new Set(["aws_region", "aws_availability_zone"]);

export type TerraformAuditParameterDefinition = ResourceParameterDefinition & {
  readonly children?: readonly TerraformAuditParameterDefinition[] | undefined;
  readonly placeholder?: string | undefined;
  readonly schemaPath?: string | undefined;
};

export type TerraformAuditParameterCatalog = {
  readonly resources: Record<string, readonly TerraformAuditParameterDefinition[]>;
};

export type TerraformResourceValidationAuditStatus =
  | "validate_passed"
  | "parameter_panel_gap"
  | "dependency_blocked"
  | "generation_error"
  | "terraform_cli_failed"
  | "unsupported_by_ui"
  | "excluded_area_node"
  | "excluded_data_source";

export type TerraformResourceValidationAuditCandidate = {
  readonly definitionId: string;
  readonly enabled: boolean;
  readonly label: string;
  readonly name: string;
  readonly provider: CloudProvider;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformResourceType: string;
};

export type TerraformResourceValidationAuditResult = {
  readonly definitionId: string;
  readonly dependencyResourceTypes: readonly string[];
  readonly diagnostics: readonly string[];
  readonly missingParameters: readonly string[];
  readonly status: TerraformResourceValidationAuditStatus;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformResourceType: string;
  readonly validateExitCode?: number | undefined;
};

export type TerraformResourceValidationAuditReport = {
  readonly archiveProviderVersion: string;
  readonly kubernetesProviderVersion: string;
  readonly providerVersion: string;
  readonly results: readonly TerraformResourceValidationAuditResult[];
  readonly workdir?: string | undefined;
};

export type TerraformResourceValidationAuditOptions = {
  readonly catalog: TerraformAuditParameterCatalog;
  readonly candidates: readonly TerraformResourceValidationAuditCandidate[];
  readonly includeDataSources?: boolean | undefined;
  readonly keepWorkdir?: boolean | undefined;
  readonly kubernetesProviderVersion?: string | undefined;
  readonly providerRegion?: string | undefined;
  readonly providerVersion?: string | undefined;
  readonly terraformBinary?: string | undefined;
  readonly timeoutMs?: number | undefined;
};

export type TerraformProviderSchema = {
  readonly data_source_schemas?: Record<string, TerraformSchemaResource> | undefined;
  readonly resource_schemas?: Record<string, TerraformSchemaResource> | undefined;
};

export type TerraformSchemaResource = {
  readonly block?: TerraformSchemaBlock | undefined;
};

export type TerraformSchemaBlock = {
  readonly attributes?: Record<string, TerraformSchemaAttribute> | undefined;
  readonly block_types?: Record<string, TerraformSchemaBlockType> | undefined;
};

export type TerraformSchemaAttribute = {
  readonly required?: boolean | undefined;
};

export type TerraformSchemaBlockType = {
  readonly block?: TerraformSchemaBlock | undefined;
  readonly min_items?: number | undefined;
};

type BuildNodeResult =
  | {
      readonly node: DiagramNode;
      readonly dependencyNodes: readonly DiagramNode[];
      readonly dependencyResourceTypes: readonly string[];
      readonly diagnostics: readonly string[];
      readonly ok: true;
    }
  | {
      readonly dependencyNodes: readonly DiagramNode[];
      readonly dependencyResourceTypes: readonly string[];
      readonly diagnostics: readonly string[];
      readonly ok: false;
    };

export function createTerraformResourceValidationCandidates(
  resourceCatalog: readonly ResourceItem[]
): TerraformResourceValidationAuditCandidate[] {
  return resourceCatalog
    .flatMap((item) => {
      const definition = getResourceDefinitionById(item.id);

      if (!item.enabled || !definition) {
        return [];
      }

      return [{
        definitionId: item.id,
        enabled: item.enabled,
        label: item.nodeDefaults.label,
        name: item.name,
        provider: definition.provider,
        terraformBlockType: definition.terraform.blockType,
        terraformResourceType: definition.terraform.resourceType
      }];
    });
}

export async function runTerraformResourceValidationAudit(
  options: TerraformResourceValidationAuditOptions
): Promise<TerraformResourceValidationAuditReport> {
  const providerVersion = options.providerVersion ?? defaultProviderVersion;
  const archiveProviderVersion = defaultArchiveProviderVersion;
  const kubernetesProviderVersion =
    options.kubernetesProviderVersion ?? defaultKubernetesProviderVersion;
  const workdir = await mkdtemp(join(tmpdir(), "sketchcatch-terraform-resource-audit-"));

  try {
    await writeFile(
      join(workdir, "provider.tf"),
      renderProviderTerraform({
        archiveProviderVersion,
        kubernetesProviderVersion,
        providerRegion: options.providerRegion ?? defaultProviderRegion,
        providerVersion
      }),
      "utf8"
    );

    const commandOptions = createTerraformCommandOptions(options);
    const initResult = await runTerraformInit(workdir, commandOptions);

    if (initResult.exitCode !== 0) {
      return {
        archiveProviderVersion,
        kubernetesProviderVersion,
        providerVersion,
        results: options.candidates.map((candidate) =>
          createCliFailureResult(candidate, "terraform init failed", initResult)
        ),
        ...(options.keepWorkdir ? { workdir } : {})
      };
    }

    const schemaResult = await runTerraformProvidersSchemaJson(workdir, commandOptions);
    const providerSchemas = parseProviderSchemas(schemaResult);

    if (!providerSchemas) {
      return {
        archiveProviderVersion,
        kubernetesProviderVersion,
        providerVersion,
        results: options.candidates.map((candidate) =>
          createCliFailureResult(candidate, "terraform providers schema -json failed", schemaResult)
        ),
        ...(options.keepWorkdir ? { workdir } : {})
      };
    }

    const results: TerraformResourceValidationAuditResult[] = [];

    for (const candidate of options.candidates) {
      results.push(
        await auditCandidate(candidate, {
          catalog: options.catalog,
          commandOptions,
          includeDataSources: options.includeDataSources !== false,
          providerSchemas,
          workdir
        })
      );
    }

    return {
      archiveProviderVersion,
      kubernetesProviderVersion,
      providerVersion,
      results,
      ...(options.keepWorkdir ? { workdir } : {})
    };
  } finally {
    if (!options.keepWorkdir) {
      await rm(workdir, { force: true, recursive: true });
    }
  }
}

export function renderTerraformResourceValidationAuditMarkdown(
  report: TerraformResourceValidationAuditReport
): string {
  const sections: Array<[string, TerraformResourceValidationAuditStatus]> = [
    ["Validate 통과", "validate_passed"],
    ["파라미터 추가 필요", "parameter_panel_gap"],
    ["참조 리소스 보완 필요", "dependency_blocked"],
    ["생성기 오류", "generation_error"],
    ["Terraform CLI 오류", "terraform_cli_failed"],
    ["UI 미지원", "unsupported_by_ui"],
    ["제외: 영역 노드", "excluded_area_node"],
    ["제외: data source", "excluded_data_source"]
  ];
  const lines = [
    "# Terraform Resource Validation Audit",
    "",
    `- Archive provider: hashicorp/archive ${report.archiveProviderVersion}`,
    `- AWS provider: hashicorp/aws ${report.providerVersion}`,
    `- Kubernetes provider: hashicorp/kubernetes ${report.kubernetesProviderVersion}`,
    `- Total: ${report.results.length}`,
    ""
  ];

  for (const [title, status] of sections) {
    const results = report.results.filter((result) => result.status === status);

    lines.push(`## ${title} (${results.length})`);

    if (results.length === 0) {
      lines.push("- 없음", "");
      continue;
    }

    for (const result of results) {
      const details = [
        result.missingParameters.length > 0
          ? `missing: ${result.missingParameters.join(", ")}`
          : "",
        result.diagnostics.length > 0 ? `diagnostics: ${result.diagnostics.join(" | ")}` : ""
      ].filter(Boolean);

      lines.push(
        `- ${result.definitionId} (${result.terraformBlockType}.${result.terraformResourceType})${
          details.length > 0 ? ` - ${details.join("; ")}` : ""
        }`
      );
    }

    lines.push("");
  }

  if (report.workdir) {
    lines.push(`Workdir kept: ${report.workdir}`, "");
  }

  return lines.join("\n");
}

async function auditCandidate(
  candidate: TerraformResourceValidationAuditCandidate,
  context: {
    readonly catalog: TerraformAuditParameterCatalog;
    readonly commandOptions: RunTerraformCommandOptions;
    readonly includeDataSources: boolean;
    readonly providerSchemas: Readonly<Record<string, TerraformProviderSchema>>;
    readonly workdir: string;
  }
): Promise<TerraformResourceValidationAuditResult> {
  const definition = getResourceDefinitionByTerraform(
    candidate.terraformBlockType,
    candidate.terraformResourceType
  );
  const baseResult = createBaseResult(candidate);

  if (areaResourceTypes.has(candidate.terraformResourceType)) {
    return {
      ...baseResult,
      dependencyResourceTypes: [],
      diagnostics: ["Canvas area node; no Terraform resource/data block is rendered."],
      missingParameters: [],
      status: "excluded_area_node"
    };
  }

  if (candidate.terraformBlockType === "data" && !context.includeDataSources) {
    return {
      ...baseResult,
      dependencyResourceTypes: [],
      diagnostics: ["Data source audit is disabled by default because it does not create resources."],
      missingParameters: [],
      status: "excluded_data_source"
    };
  }

  if (!definition?.capabilities.terraformPreview || !definition.capabilities.parameterPanel) {
    return {
      ...baseResult,
      dependencyResourceTypes: [],
      diagnostics: ["Resource is not currently supported by Terraform Preview or the parameter panel."],
      missingParameters: [],
      status: "unsupported_by_ui"
    };
  }

  const definitions = context.catalog.resources[
    createTerraformParameterCatalogKey(
      candidate.terraformBlockType,
      candidate.terraformResourceType
    )
  ];

  if (!definitions) {
    return {
      ...baseResult,
      dependencyResourceTypes: [],
      diagnostics: ["No right-panel parameter catalog exists for this Terraform type."],
      missingParameters: [],
      status: "parameter_panel_gap"
    };
  }

  const schemaBlock = getSchemaBlock(
    context.providerSchemas,
    definition.provider,
    candidate.terraformBlockType,
    candidate.terraformResourceType
  );
  const missingParameters = schemaBlock
    ? findMissingRequiredPanelParameters(schemaBlock, definitions)
    : [`${candidate.terraformResourceType} provider schema`];
  const buildResult = buildAuditNode({
    catalog: context.catalog,
    definition,
    definitions,
    resourceName: toAuditResourceName(candidate.terraformResourceType),
    stack: []
  });

  if (!buildResult.ok) {
    return {
      ...baseResult,
      dependencyResourceTypes: buildResult.dependencyResourceTypes,
      diagnostics: buildResult.diagnostics,
      missingParameters,
      status: "dependency_blocked"
    };
  }

  const diagramJson: DiagramJson = {
    nodes: [...dedupeDiagramNodes(buildResult.dependencyNodes), buildResult.node],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  let terraformCode: string;

  try {
    terraformCode = generateTerraformFromDiagramJson(diagramJson);
  } catch (error) {
    return {
      ...baseResult,
      dependencyResourceTypes: buildResult.dependencyResourceTypes,
      diagnostics: [error instanceof Error ? error.message : String(error)],
      missingParameters,
      status: "generation_error"
    };
  }

  await writeFile(join(context.workdir, "audit.tf"), terraformCode, "utf8");

  const validateResult = await runTerraformValidate(context.workdir, context.commandOptions);
  const diagnostics = [
    ...buildResult.diagnostics,
    ...extractTerraformDiagnostics(validateResult)
  ];

  if (validateResult.exitCode !== 0) {
    return {
      ...baseResult,
      dependencyResourceTypes: buildResult.dependencyResourceTypes,
      diagnostics,
      missingParameters: mergeMissingParameters(
        missingParameters,
        extractMissingRequiredArguments(validateResult)
      ),
      status: missingParameters.length > 0 ? "parameter_panel_gap" : "generation_error",
      validateExitCode: validateResult.exitCode
    };
  }

  if (missingParameters.length > 0) {
    return {
      ...baseResult,
      dependencyResourceTypes: buildResult.dependencyResourceTypes,
      diagnostics,
      missingParameters,
      status: "parameter_panel_gap",
      validateExitCode: validateResult.exitCode
    };
  }

  return {
    ...baseResult,
    dependencyResourceTypes: buildResult.dependencyResourceTypes,
    diagnostics,
    missingParameters,
    status: "validate_passed",
    validateExitCode: validateResult.exitCode
  };
}

export function findMissingRequiredPanelParameters(
  schemaBlock: TerraformSchemaBlock,
  definitions: readonly TerraformAuditParameterDefinition[]
): string[] {
  const requiredPaths = collectRequiredSchemaPaths(schemaBlock);
  const panelPaths = new Set(collectPanelSchemaPaths(definitions));

  return requiredPaths.filter((path) => !panelPaths.has(path));
}

function buildAuditNode(input: {
  readonly catalog: TerraformAuditParameterCatalog;
  readonly definition: ResourceDefinition;
  readonly definitions: readonly TerraformAuditParameterDefinition[];
  readonly resourceName: string;
  readonly stack: readonly string[];
}): BuildNodeResult {
  if (input.stack.includes(input.definition.terraform.resourceType)) {
    return {
      dependencyNodes: [],
      dependencyResourceTypes: [],
      diagnostics: [`Circular reference while building ${input.definition.terraform.resourceType}.`],
      ok: false
    };
  }

  const values: Record<string, unknown> = {};
  const dependencyNodes: DiagramNode[] = [];
  const dependencyResourceTypes: string[] = [];
  const diagnostics: string[] = [];

  for (const definition of getFillableDefinitions(input.definitions)) {
    const sample = createSampleValue(definition, {
      catalog: input.catalog,
      stack: [...input.stack, input.definition.terraform.resourceType]
    });

    if (!sample.ok) {
      diagnostics.push(...sample.diagnostics);
      dependencyNodes.push(...sample.dependencyNodes);
      dependencyResourceTypes.push(...sample.dependencyResourceTypes);

      return {
        dependencyNodes,
        dependencyResourceTypes,
        diagnostics,
        ok: false
      };
    }

    values[definition.name] = sample.value;
    dependencyNodes.push(...sample.dependencyNodes);
    dependencyResourceTypes.push(...sample.dependencyResourceTypes);
    diagnostics.push(...sample.diagnostics);
  }

  return {
    dependencyNodes,
    dependencyResourceTypes: [...new Set(dependencyResourceTypes)],
    diagnostics,
    node: createDiagramNode({
      resourceName: input.resourceName,
      terraformBlockType: input.definition.terraform.blockType,
      terraformResourceType: input.definition.terraform.resourceType,
      values
    }),
    ok: true
  };
}

type SampleValueResult =
  | {
      readonly dependencyNodes: readonly DiagramNode[];
      readonly dependencyResourceTypes: readonly string[];
      readonly diagnostics: readonly string[];
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly dependencyNodes: readonly DiagramNode[];
      readonly dependencyResourceTypes: readonly string[];
      readonly diagnostics: readonly string[];
      readonly ok: false;
    };

function createSampleValue(
  definition: TerraformAuditParameterDefinition,
  context: {
    readonly catalog: TerraformAuditParameterCatalog;
    readonly stack: readonly string[];
  }
): SampleValueResult {
  if (definition.inputKind === "reference-picker") {
    return createReferenceSampleValue(definition, context);
  }

  if (definition.inputKind === "nested-block" || definition.children?.length) {
    return createNestedBlockSampleValue(definition, context);
  }

  const scalarValue = createScalarSampleValue(definition);

  if (definition.type === "list" || definition.type === "set") {
    return createSampleValueResult([scalarValue]);
  }

  if (definition.type === "map") {
    return createSampleValueResult({ Name: "sketchcatch-audit" });
  }

  if (definition.type === "object") {
    return createSampleValueResult({});
  }

  return createSampleValueResult(scalarValue);
}

function createReferenceSampleValue(
  definition: TerraformAuditParameterDefinition,
  context: {
    readonly catalog: TerraformAuditParameterCatalog;
    readonly stack: readonly string[];
  }
): SampleValueResult {
  const [targetType] = definition.referenceTargetTypes ?? [];

  if (!targetType) {
    return {
      dependencyNodes: [],
      dependencyResourceTypes: [],
      diagnostics: [`${definition.name} has no reference target types.`],
      ok: false
    };
  }

  const targetDefinition =
    getResourceDefinitionByTerraform("resource", targetType) ??
    getResourceDefinitionByTerraform("data", targetType);
  const targetBlockType = targetDefinition?.terraform.blockType ?? "resource";
  const targetDefinitions = context.catalog.resources[
    createTerraformParameterCatalogKey(targetBlockType, targetType)
  ];

  if (!targetDefinition?.capabilities.terraformPreview || !targetDefinitions) {
    return {
      dependencyNodes: [],
      dependencyResourceTypes: [targetType],
      diagnostics: [`${definition.name} target ${targetType} is not buildable from the parameter panel.`],
      ok: false
    };
  }

  const resourceName = toAuditResourceName(targetType);
  const targetNode = buildAuditNode({
    catalog: context.catalog,
    definition: targetDefinition,
    definitions: targetDefinitions,
    resourceName,
    stack: context.stack
  });

  if (!targetNode.ok) {
    return {
      dependencyNodes: targetNode.dependencyNodes,
      dependencyResourceTypes: [targetType, ...targetNode.dependencyResourceTypes],
      diagnostics: targetNode.diagnostics,
      ok: false
    };
  }

  const reference = `${targetBlockType === "data" ? "data." : ""}${targetType}.${resourceName}.${
    definition.referenceAttribute ?? "id"
  }`;

  return {
    dependencyNodes: [...targetNode.dependencyNodes, targetNode.node],
    dependencyResourceTypes: [targetType, ...targetNode.dependencyResourceTypes],
    diagnostics: targetNode.diagnostics,
    ok: true,
    value: definition.type === "list" || definition.type === "set" ? [reference] : reference
  };
}

function createNestedBlockSampleValue(
  definition: TerraformAuditParameterDefinition,
  context: {
    readonly catalog: TerraformAuditParameterCatalog;
    readonly stack: readonly string[];
  }
): SampleValueResult {
  const children = definition.children ?? [];
  const value: Record<string, unknown> = {};
  const dependencyNodes: DiagramNode[] = [];
  const dependencyResourceTypes: string[] = [];
  const diagnostics: string[] = [];

  for (const child of getFillableDefinitions(children)) {
    const sample = createSampleValue(child, context);

    if (!sample.ok) {
      return {
        dependencyNodes: [...dependencyNodes, ...sample.dependencyNodes],
        dependencyResourceTypes: [...dependencyResourceTypes, ...sample.dependencyResourceTypes],
        diagnostics: [...diagnostics, ...sample.diagnostics],
        ok: false
      };
    }

    value[child.name] = sample.value;
    dependencyNodes.push(...sample.dependencyNodes);
    dependencyResourceTypes.push(...sample.dependencyResourceTypes);
    diagnostics.push(...sample.diagnostics);
  }

  const nestedValue =
    definition.type === "list" || definition.type === "set"
      ? createCollectionNestedBlockSample(definition, value)
      : value;

  return createSampleValueResult(
    nestedValue,
    dependencyNodes,
    dependencyResourceTypes,
    diagnostics
  );
}

function createSampleValueResult(
  value: unknown,
  dependencyNodes: readonly DiagramNode[] = [],
  dependencyResourceTypes: readonly string[] = [],
  diagnostics: readonly string[] = []
): SampleValueResult {
  return {
    dependencyNodes,
    dependencyResourceTypes,
    diagnostics,
    ok: true,
    value
  };
}

function createScalarSampleValue(definition: TerraformAuditParameterDefinition): string | number | boolean {
  if (
    (definition.inputKind === "select" || definition.inputKind === "multi-select") &&
    definition.options?.[0]
  ) {
    return definition.options[0];
  }

  if (definition.type === "number") {
    const parsed = Number(definition.placeholder);
    return Number.isFinite(parsed) ? parsed : 1;
  }

  if (definition.type === "boolean") {
    return true;
  }

  const name = definition.terraformName.toLowerCase();

  if (name === "public_key") {
    return "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDSketchCatchAudit";
  }

  if (name.includes("policy")) {
    return JSON.stringify({ Version: "2012-10-17", Statement: [] });
  }

  if (name === "dashboard_body" || name === "event_pattern") {
    return JSON.stringify({ source: ["sketchcatch.audit"] });
  }

  if (name === "principal") {
    return "123456789012";
  }

  if (name === "schedule_expression") {
    return "rate(5 minutes)";
  }

  if (name === "container_definitions") {
    return JSON.stringify([
      {
        name: "app",
        image: "public.ecr.aws/docker/library/nginx:latest",
        essential: true
      }
    ]);
  }

  if (name.includes("password")) {
    return "ExamplePassword123!";
  }

  if (name.includes("arn")) {
    return "arn:aws:iam::123456789012:role/sketchcatch-audit";
  }

  if (name.includes("cidr")) {
    return definition.placeholder ?? "10.0.0.0/16";
  }

  if (name === "runtime") {
    return "nodejs20.x";
  }

  if (name === "handler") {
    return "index.handler";
  }

  return definition.placeholder && !definition.placeholder.startsWith("var.")
    ? definition.placeholder
    : "sketchcatch-audit";
}

function createCollectionNestedBlockSample(
  definition: TerraformAuditParameterDefinition,
  value: Record<string, unknown>
): Record<string, unknown>[] {
  if (definition.terraformName !== "stage") {
    return [value];
  }

  return [
    value,
    {
      ...value,
      name: "Deploy"
    }
  ];
}

function getFillableDefinitions(definitions: readonly TerraformAuditParameterDefinition[]) {
  return definitions.filter((definition) => definition.required || definition.core);
}

function createDiagramNode(input: {
  readonly resourceName: string;
  readonly terraformBlockType: TerraformBlockType;
  readonly terraformResourceType: string;
  readonly values: Record<string, unknown>;
}): DiagramNode {
  return {
    id: `${input.terraformResourceType}-${input.resourceName}`,
    kind: "resource",
    label: input.resourceName,
    locked: false,
    parameters: {
      fileName: "audit",
      resourceName: input.resourceName,
      resourceType: input.terraformResourceType,
      terraformBlockType: input.terraformBlockType,
      values: input.values
    },
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    type: input.terraformResourceType,
    zIndex: 0
  };
}

function collectRequiredSchemaPaths(block: TerraformSchemaBlock, prefix = ""): string[] {
  const paths: string[] = [];

  for (const [name, attribute] of Object.entries(block.attributes ?? {})) {
    if (attribute.required) {
      paths.push(prefix ? `${prefix}.${name}` : name);
    }
  }

  for (const [name, blockType] of Object.entries(block.block_types ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;

    if ((blockType.min_items ?? 0) > 0) {
      paths.push(path);
      if (blockType.block) {
        paths.push(...collectRequiredSchemaPaths(blockType.block, path));
      }
    }
  }

  return [...new Set(paths)].sort();
}

function dedupeDiagramNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  const nodeByAddress = new Map<string, DiagramNode>();

  for (const node of nodes) {
    const terraformBlockType = node.parameters?.terraformBlockType ?? "resource";
    const terraformResourceType = node.parameters?.resourceType ?? node.type;
    const terraformResourceName = node.parameters?.resourceName ?? node.id;
    const key = `${terraformBlockType}.${terraformResourceType}.${terraformResourceName}`;

    if (!nodeByAddress.has(key)) {
      nodeByAddress.set(key, node);
    }
  }

  return [...nodeByAddress.values()];
}

function collectPanelSchemaPaths(
  definitions: readonly TerraformAuditParameterDefinition[],
  prefix = ""
): string[] {
  return definitions.flatMap((definition) => {
    const schemaPath = definition.schemaPath ?? definition.terraformName;
    const path = prefix ? `${prefix}.${schemaPath}` : schemaPath;
    const childPaths = definition.children
      ? collectPanelSchemaPaths(definition.children, path)
      : [];

    return [path, ...childPaths];
  });
}

function getSchemaBlock(
  providerSchemas: Readonly<Record<string, TerraformProviderSchema>>,
  provider: CloudProvider,
  blockType: TerraformBlockType,
  resourceType: string
): TerraformSchemaBlock | null {
  const address = provider === "kubernetes" ? kubernetesProviderAddress : providerAddress;
  const providerSchema = providerSchemas[address];

  if (!providerSchema) {
    return null;
  }

  const collection =
    blockType === "data" ? providerSchema.data_source_schemas : providerSchema.resource_schemas;

  return collection?.[resourceType]?.block ?? null;
}

function parseProviderSchemas(
  result: TerraformRunResult
): Record<string, TerraformProviderSchema> | null {
  if (result.exitCode !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      provider_schemas?: Record<string, TerraformProviderSchema> | undefined;
    };

    return parsed.provider_schemas ?? null;
  } catch {
    return null;
  }
}

function renderProviderTerraform(input: {
  readonly archiveProviderVersion: string;
  readonly kubernetesProviderVersion: string;
  readonly providerRegion: string;
  readonly providerVersion: string;
}): string {
  return [
    "terraform {",
    "  required_providers {",
    "    archive = {",
    '      source = "hashicorp/archive"',
    `      version = "${input.archiveProviderVersion}"`,
    "    }",
    "    aws = {",
    '      source = "hashicorp/aws"',
    `      version = "${input.providerVersion}"`,
    "    }",
    "    kubernetes = {",
    '      source = "hashicorp/kubernetes"',
    `      version = "${input.kubernetesProviderVersion}"`,
    "    }",
    "  }",
    "}",
    "",
    'provider "kubernetes" {',
    '  host     = "https://127.0.0.1"',
    '  token    = "sketchcatch-audit"',
    "  insecure = true",
    "}",
    "",
    'provider "aws" {',
    `  region = "${input.providerRegion}"`,
    "  skip_credentials_validation = true",
    "  skip_metadata_api_check = true",
    "  skip_requesting_account_id = true",
    "}",
    ""
  ].join("\n");
}

function createTerraformCommandOptions(
  options: TerraformResourceValidationAuditOptions
): RunTerraformCommandOptions {
  return {
    maxOutputBytes: defaultTerraformAuditOutputMaxBytes,
    ...(options.terraformBinary ? { terraformBinary: options.terraformBinary } : {}),
    timeoutMs: options.timeoutMs ?? defaultTerraformTimeoutMs
  };
}

function createBaseResult(
  candidate: TerraformResourceValidationAuditCandidate
): Omit<
  TerraformResourceValidationAuditResult,
  "dependencyResourceTypes" | "diagnostics" | "missingParameters" | "status"
> {
  return {
    definitionId: candidate.definitionId,
    terraformBlockType: candidate.terraformBlockType,
    terraformResourceType: candidate.terraformResourceType
  };
}

function createCliFailureResult(
  candidate: TerraformResourceValidationAuditCandidate,
  message: string,
  result: TerraformRunResult
): TerraformResourceValidationAuditResult {
  return {
    ...createBaseResult(candidate),
    dependencyResourceTypes: [],
    diagnostics: [message, ...extractTerraformDiagnostics(result)],
    missingParameters: [],
    status: "terraform_cli_failed",
    validateExitCode: result.exitCode
  };
}

function extractTerraformDiagnostics(result: TerraformRunResult): string[] {
  return [result.stderr, result.stdout]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/\s+/g, " ").slice(0, 500));
}

function extractMissingRequiredArguments(result: TerraformRunResult): string[] {
  const output = `${result.stderr}\n${result.stdout}`;
  const matches = output.matchAll(/The argument "([^"]+)" is required/g);

  return [
    ...new Set(
      [...matches].flatMap((match) => {
        const argumentName = match[1];

        return argumentName ? [argumentName] : [];
      })
    )
  ].sort();
}

function mergeMissingParameters(left: readonly string[], right: readonly string[]) {
  return [...new Set([...left, ...right])].sort();
}

function toAuditResourceName(terraformResourceType: string): string {
  return `audit_${terraformResourceType.replace(/^aws_/, "").replace(/[^A-Za-z0-9_]/g, "_")}`;
}
