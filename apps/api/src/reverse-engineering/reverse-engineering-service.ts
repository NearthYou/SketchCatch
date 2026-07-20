import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { RESOURCE_TYPES } from "@sketchcatch/types";
import type {
  AwsConnection,
  ArchitectureJson,
  CheckFinding,
  DiscoveredResource,
  ResourceType,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringDraft,
  ReverseEngineeringImportSuggestion,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScan,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanLogLevel,
  ReverseEngineeringScanResult,
  ReverseEngineeringScanStage
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  projects,
  reverseEngineeringScanLogs,
  reverseEngineeringScans
} from "../db/schema.js";
import type { ProjectAccessContext, ProjectRecord } from "../deployments/deployment-service.js";
import {
  containsAwsArn,
  createAwsProviderAdapter,
  createAwsPublicDisplayName,
  createAwsPublicProviderResourceId,
  createAwsPublicResourceConfig,
  type AwsProviderAdapter
} from "./aws-provider-adapter.js";
import { createAwsReverseEngineeringGateway } from "./aws-reverse-engineering-gateway.js";
import {
  createAwsResourceDisplayName,
  createAwsResourceDisplayNameMap
} from "./aws-resource-display-name.js";
import {
  classifyReverseEngineeringConnectionFailure,
  createReverseEngineeringPublicCoverage,
  sanitizeReverseEngineeringScanErrors,
  type ReverseEngineeringConnectionFailureClassification
} from "./reverse-engineering-public-errors.js";

export type ReverseEngineeringScanRecord = typeof reverseEngineeringScans.$inferSelect;
export type ReverseEngineeringScanLogRecord = typeof reverseEngineeringScanLogs.$inferSelect;

export type CreateReverseEngineeringScanInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  awsConnectionId: string;
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
};

export type CreateReverseEngineeringPreviewScanInput = Omit<
  CreateReverseEngineeringScanInput,
  "projectId"
>;

export type CreateReverseEngineeringScanRecordInput = {
  id: string;
  projectId: string;
  awsConnectionId: string;
  provider: "aws";
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
  status: "running";
  startedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AppendReverseEngineeringScanLogInput = {
  id: string;
  scanId: string;
  sequence: number;
  stage: ReverseEngineeringScanStage;
  level: ReverseEngineeringScanLogLevel;
  message: string;
  createdAt: Date;
};

export type ReverseEngineeringRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ProjectRecord | undefined>;
  findVerifiedAwsConnection(
    awsConnectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnection | undefined>;
  createScan(input: CreateReverseEngineeringScanRecordInput): Promise<ReverseEngineeringScanRecord>;
  completeScan(
    scanId: string,
    result: ReverseEngineeringScanResult,
    completedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  failScan(
    scanId: string,
    errorSummary: string,
    failedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  findAccessibleScan(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  listScansByProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanRecord[]>;
  requestScanCancellation(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext,
    requestedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  softDeleteScan(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext,
    deletedAt: Date
  ): Promise<ReverseEngineeringScanRecord | undefined>;
  appendScanLog(input: AppendReverseEngineeringScanLogInput): Promise<ReverseEngineeringScanLogRecord>;
  listScanLogs(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringScanLogRecord[]>;
};

export type ReverseEngineeringServiceOptions = {
  adapter?: AwsProviderAdapter;
  generateId?: () => string;
  now?: () => Date;
};

export type ReverseEngineeringScanJob = {
  scan: ReverseEngineeringScan;
  run(): Promise<ReverseEngineeringScanResult>;
};

export type PersistedReverseEngineeringScanResult = Omit<
  ReverseEngineeringScanResult,
  "scan" | "reverseEngineeringDraft"
> & {
  scan?: ReverseEngineeringScan | undefined;
  reverseEngineeringDraft?: unknown;
};

const REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS = [
  "providerResourceId",
  "providerResourceType",
  "region",
  "accountId",
  "terraformResourceName",
  "terraformResourceType"
] as const;
const REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS = ["displayName", "description"] as const;
const RESOURCE_TYPE_SET = new Set<string>(RESOURCE_TYPES);

export class ReverseEngineeringNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReverseEngineeringNotFoundError";
  }
}

// JSONB에 저장된 과거 스캔은 draft가 없을 수 있으므로, 읽을 때만 현재 응답 계약으로 보정합니다.
export function normalizeReverseEngineeringScanResult(
  scan: ReverseEngineeringScan,
  persistedResult: PersistedReverseEngineeringScanResult
): ReverseEngineeringScanResult {
  const normalizationContext = createReadCompatibilityNormalizationContext(persistedResult);
  const publicResourceIdMap = createReadCompatibilityPublicResourceIdMap(
    persistedResult.discoveredResources
  );
  const normalizedArchitectureJson = normalizeReadCompatibilityArchitecture(
    persistedResult.architectureJson,
    normalizationContext
  );
  const architectureJson = sanitizeReadCompatibilityArchitecture(
    normalizedArchitectureJson,
    publicResourceIdMap
  );
  const persistedDraft = persistedResult.reverseEngineeringDraft;
  const scanErrors = sanitizeReverseEngineeringScanErrors(persistedResult.scanErrors);
  const normalizedDraft = isUsableReverseEngineeringDraft(persistedDraft, scan.id)
    ? normalizeReadCompatibilityDraft(persistedDraft, normalizationContext)
    : createReadCompatibilityDraft(scan, normalizedArchitectureJson);
  const draftArchitectureJson =
    normalizedDraft.architectureJson === normalizedArchitectureJson
      ? architectureJson
      : sanitizeReadCompatibilityArchitecture(
          normalizedDraft.architectureJson,
          publicResourceIdMap
        );
  const publicDraftId = sanitizePublicStructuredId(
    normalizedDraft.id,
    "AWS::ReverseEngineering::Draft",
    "draft"
  );
  const draft = {
    ...normalizedDraft,
    id: publicDraftId,
    architectureJson: draftArchitectureJson
  };

  return {
    ...persistedResult,
    scan: sanitizePublicScan(scan),
    discoveredResources: persistedResult.discoveredResources.map((resource) =>
      sanitizeReadCompatibilityDiscoveredResource(resource, publicResourceIdMap)
    ),
    architectureJson,
    reverseEngineeringDraft: draft,
    findings: sanitizePublicFindings(persistedResult.findings, publicResourceIdMap),
    analysisExclusions: sanitizePublicAnalysisExclusions(
      persistedResult.analysisExclusions,
      publicResourceIdMap
    ),
    scanErrors,
    coverage: createReverseEngineeringPublicCoverage(scanErrors).coverage,
    importSuggestions: sanitizePublicImportSuggestions(
      sanitizeImportSuggestions(normalizationContext, persistedResult.importSuggestions),
      publicResourceIdMap
    )
  };
}

function createReadCompatibilityPublicResourceIdMap(
  resources: readonly DiscoveredResource[]
): ReadonlyMap<string, string> {
  const publicResourceIdMap = new Map<string, string>();
  const publicIdsByProviderResourceId = new Map<string, Set<string>>();

  for (const resource of resources) {
    const publicProviderResourceId = createAwsPublicProviderResourceId({
      providerResourceType: resource.providerResourceType,
      providerResourceId: resource.providerResourceId
    });
    const publicResourceId =
      publicProviderResourceId !== resource.providerResourceId
        ? `resource-${publicProviderResourceId}`
        : sanitizePublicStructuredId(
            resource.id,
            resource.providerResourceType,
            "resource"
          );
    publicResourceIdMap.set(resource.id, publicResourceId);

    const publicIds = publicIdsByProviderResourceId.get(resource.providerResourceId) ?? new Set();
    publicIds.add(publicResourceId);
    publicIdsByProviderResourceId.set(resource.providerResourceId, publicIds);
  }

  for (const [providerResourceId, publicIds] of publicIdsByProviderResourceId) {
    if (publicIds.size === 1 && !publicResourceIdMap.has(providerResourceId)) {
      publicResourceIdMap.set(providerResourceId, [...publicIds][0]!);
    }
  }

  return publicResourceIdMap;
}

function sanitizeReadCompatibilityDiscoveredResource(
  resource: DiscoveredResource,
  publicResourceIdMap: ReadonlyMap<string, string>
): DiscoveredResource {
  const identity = {
    providerResourceType: resource.providerResourceType,
    providerResourceId: resource.providerResourceId
  };
  const displayName = createAwsResourceDisplayName(resource);

  return {
    ...resource,
    id: sanitizePublicResourceReference(
      resource.id,
      publicResourceIdMap,
      resource.providerResourceType
    ),
    providerResourceId: createAwsPublicProviderResourceId(identity),
    displayName: createAwsPublicDisplayName(identity, displayName),
    config: createAwsPublicResourceConfig({
      providerResourceType: resource.providerResourceType,
      config: resource.config
    }),
    relationships: resource.relationships?.map((relationship) => ({
      ...relationship,
      targetResourceId: sanitizePublicResourceReference(
        relationship.targetResourceId,
        publicResourceIdMap
      )
    }))
  };
}

function sanitizeReadCompatibilityArchitecture(
  architectureJson: ArchitectureJson,
  publicResourceIdMap: ReadonlyMap<string, string>
): ArchitectureJson {
  const nodes = architectureJson.nodes.map((node) => {
    const providerResourceType = getNodeProviderResourceType(node);
    const rawProviderResourceId =
      readNonEmptyConfigString(node.config["providerResourceId"]) ??
      (node.label && containsAwsArn(node.label) ? node.label : undefined);
    const identity = {
      providerResourceType,
      providerResourceId: rawProviderResourceId ?? node.id
    };
    const config = createAwsPublicResourceConfig({
      providerResourceType,
      config: node.config
    });

    const publicNode = {
      ...node,
      id: sanitizePublicResourceReference(
        node.id,
        publicResourceIdMap,
        providerResourceType
      ),
      label: node.label ? createAwsPublicDisplayName(identity, node.label) : node.label,
      config: {
        ...config,
        providerResourceType,
        ...(rawProviderResourceId
          ? { providerResourceId: createAwsPublicProviderResourceId(identity) }
          : {}),
        analysisExcluded: node.config["analysisExcluded"] === true
      }
    };

    return isDeepStrictEqual(publicNode, node) ? node : publicNode;
  });
  const edges = architectureJson.edges.map((edge) => {
    const publicEdge = {
      ...edge,
      id: sanitizePublicStructuredId(
        edge.id,
        "AWS::Architecture::Edge",
        "edge",
        publicResourceIdMap
      ),
      sourceId: sanitizePublicResourceReference(edge.sourceId, publicResourceIdMap),
      targetId: sanitizePublicResourceReference(edge.targetId, publicResourceIdMap),
      ...(edge.label && containsSensitiveAwsProviderText(edge.label)
        ? { label: "AWS Resource 관계" }
        : {})
    };

    return isDeepStrictEqual(publicEdge, edge) ? edge : publicEdge;
  });

  return nodes.every((node, index) => node === architectureJson.nodes[index]) &&
    edges.every((edge, index) => edge === architectureJson.edges[index])
    ? architectureJson
    : { ...architectureJson, nodes, edges };
}

function getNodeProviderResourceType(
  node: ArchitectureJson["nodes"][number]
): string {
  const explicitType = readNonEmptyConfigString(node.config["providerResourceType"]);

  if (explicitType) {
    return explicitType;
  }

  const providerTypesByResourceType: Partial<Record<ResourceType, string>> = {
    LAMBDA: "AWS::Lambda::Function",
    LAMBDA_PERMISSION: "AWS::Lambda::Permission",
    IAM_ROLE: "AWS::IAM::Role",
    IAM_POLICY: "AWS::IAM::Policy",
    IAM_INSTANCE_PROFILE: "AWS::IAM::InstanceProfile"
  };

  return providerTypesByResourceType[node.type] ?? `AWS::${node.type}`;
}

function sanitizePublicImportSuggestions(
  importSuggestions: ReverseEngineeringImportSuggestion[],
  publicResourceIdMap: ReadonlyMap<string, string>
): ReverseEngineeringImportSuggestion[] {
  return importSuggestions.map((suggestion) => {
    const publicId = sanitizePublicStructuredId(
      suggestion.id,
      "AWS::ReverseEngineering::ImportSuggestion",
      "import",
      publicResourceIdMap
    );
    const publicResourceId = sanitizePublicResourceReference(
      suggestion.resourceId,
      publicResourceIdMap
    );
    const publicFields = [
      suggestion.terraformAddress,
      suggestion.importCommand,
      suggestion.terraformBlockDraft,
      suggestion.reason
    ];

    if (!publicFields.some((value) => value !== undefined && containsSensitiveAwsProviderText(value))) {
      return suggestion.id === publicId && suggestion.resourceId === publicResourceId
        ? suggestion
        : { ...suggestion, id: publicId, resourceId: publicResourceId };
    }

    return {
      id: publicId,
      resourceId: publicResourceId,
      status: "manual_review",
      handoffReady: false,
      reason: "보안상 원본 AWS 식별자를 공개하지 않아 자동 import를 만들 수 없습니다."
    };
  });
}

function sanitizePublicFindings(
  findings: readonly CheckFinding[],
  publicResourceIdMap: ReadonlyMap<string, string>
): CheckFinding[] {
  return findings.map((finding) => ({
    ...finding,
    id: sanitizePublicStructuredId(
      finding.id,
      "AWS::ReverseEngineering::Finding",
      "finding",
      publicResourceIdMap
    ),
    ...(finding.resourceId
      ? {
          resourceId: sanitizePublicResourceReference(
            finding.resourceId,
            publicResourceIdMap
          )
        }
      : {}),
    title: sanitizePublicFindingText(finding.title, "AWS Resource 검토가 필요합니다."),
    description: sanitizePublicFindingText(
      finding.description,
      "AWS의 민감한 원본 정보는 표시하지 않습니다."
    ),
    recommendation: sanitizePublicFindingText(
      finding.recommendation,
      "Resource 상태와 권한을 확인한 뒤 다시 시도해 주세요."
    )
  }));
}

function sanitizePublicAnalysisExclusions(
  exclusions: readonly ReverseEngineeringAnalysisExclusion[],
  publicResourceIdMap: ReadonlyMap<string, string>
): ReverseEngineeringAnalysisExclusion[] {
  return exclusions.map((exclusion) => ({
    ...exclusion,
    id: sanitizePublicStructuredId(
      exclusion.id,
      "AWS::ReverseEngineering::AnalysisExclusion",
      "analysis-exclusion",
      publicResourceIdMap
    ),
    resourceId: sanitizePublicResourceReference(exclusion.resourceId, publicResourceIdMap),
    message:
      exclusion.reason === "unsupported_resource_type"
        ? "아직 정식 지원하지 않는 Resource라 분석에서 제외됐습니다."
        : "가져온 정보가 부족해 분석에서 제외됐습니다."
  }));
}

function sanitizePublicScan(scan: ReverseEngineeringScan): ReverseEngineeringScan {
  return scan.errorSummary && containsSensitiveAwsProviderText(scan.errorSummary)
    ? {
        ...scan,
        errorSummary: "AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    : scan;
}

function sanitizePublicFindingText(value: string, fallback: string): string {
  return containsSensitiveAwsProviderText(value) ? fallback : value;
}

function containsSensitiveAwsProviderText(value: string): boolean {
  return (
    containsAwsArn(value) ||
    /\b(?:accessdenied(?:exception)?|authorizationerror|requestid)\b/iu.test(value) ||
    /(?:^|[^a-z0-9-])[a-z][a-z0-9-]*:[A-Z][A-Za-z0-9]+/u.test(value) ||
    /"(?:Action|Effect|Principal|Resource|Statement)"\s*:/iu.test(value)
  );
}

function sanitizePublicResourceReference(
  value: string,
  publicResourceIdMap: ReadonlyMap<string, string>,
  providerResourceType = "AWS::Unknown::Resource"
): string {
  return (
    publicResourceIdMap.get(value) ??
    sanitizePublicStructuredId(value, providerResourceType, "resource")
  );
}

function sanitizePublicStructuredId(
  value: string,
  providerResourceType: string,
  prefix: string,
  publicResourceIdMap: ReadonlyMap<string, string> = new Map()
): string {
  const rewrittenValue = rewriteStructuredPublicResourceReferences(
    value,
    publicResourceIdMap
  );

  if (!containsAwsArn(rewrittenValue)) {
    return rewrittenValue;
  }

  return `${prefix}-${createAwsPublicProviderResourceId({
    providerResourceType,
    providerResourceId: rewrittenValue
  })}`;
}

function rewriteStructuredPublicResourceReferences(
  value: string,
  publicResourceIdMap: ReadonlyMap<string, string>
): string {
  let rewrittenValue = value;
  const replacements = [...publicResourceIdMap.entries()]
    .filter(([privateValue, publicValue]) => privateValue.length > 0 && privateValue !== publicValue)
    .sort(([left], [right]) => right.length - left.length);

  for (const [privateValue, publicValue] of replacements) {
    rewrittenValue = rewrittenValue.replaceAll(privateValue, publicValue);
  }

  return rewrittenValue;
}

type ReadCompatibilityNormalizationContext = {
  readonly discoveredResourceById: ReadonlyMap<string, DiscoveredResource | null>;
  readonly discoveredResourceByProviderResourceId: ReadonlyMap<
    string,
    DiscoveredResource | null
  >;
  readonly displayNameByProviderResourceId: ReadonlyMap<string, string>;
  readonly reviewOnlyResourceIds: ReadonlySet<string>;
};

function createReadCompatibilityNormalizationContext(
  persistedResult: PersistedReverseEngineeringScanResult
): ReadCompatibilityNormalizationContext {
  return {
    discoveredResourceById: createUniqueDiscoveredResourceMap(
      persistedResult.discoveredResources,
      (resource) => resource.id
    ),
    discoveredResourceByProviderResourceId: createUniqueDiscoveredResourceMap(
      persistedResult.discoveredResources,
      (resource) => resource.providerResourceId
    ),
    displayNameByProviderResourceId: createAwsResourceDisplayNameMap(
      persistedResult.discoveredResources
    ),
    reviewOnlyResourceIds: new Set([
      ...persistedResult.discoveredResources
        .filter(isReviewOnlyDiscoveredResource)
        .map((resource) => resource.id),
      ...persistedResult.analysisExclusions.map((exclusion) => exclusion.resourceId)
    ])
  };
}

function createUniqueDiscoveredResourceMap(
  resources: readonly DiscoveredResource[],
  getKey: (resource: DiscoveredResource) => string
): ReadonlyMap<string, DiscoveredResource | null> {
  const result = new Map<string, DiscoveredResource | null>();

  for (const resource of resources) {
    const key = getKey(resource).trim();

    if (!key) {
      continue;
    }

    result.set(key, result.has(key) ? null : resource);
  }

  return result;
}

function normalizeReadCompatibilityArchitecture(
  architectureJson: ArchitectureJson,
  context: ReadCompatibilityNormalizationContext
): ArchitectureJson {
  let changed = false;
  const nodes = architectureJson.nodes.map((node) => {
    const normalizedNode = normalizeReadCompatibilityNode(node, context);

    changed ||= normalizedNode !== node;
    return normalizedNode;
  });

  return changed ? { ...architectureJson, nodes } : architectureJson;
}

function normalizeReadCompatibilityNode(
  node: ArchitectureJson["nodes"][number],
  context: ReadCompatibilityNormalizationContext
): ArchitectureJson["nodes"][number] {
  const resource = findCorrelatedDiscoveredResource(node, context);

  if (!resource) {
    const label = createFailClosedLegacyNodeLabel(node);
    const rawLabel = node.label?.trim() || node.id;
    const rawProviderResourceId =
      rawLabel.startsWith("arn:") &&
      readNonEmptyConfigString(node.config["providerResourceId"]) === undefined
        ? rawLabel
        : undefined;
    const config = {
      ...node.config,
      ...(rawProviderResourceId ? { providerResourceId: rawProviderResourceId } : {}),
      analysisExcluded: true
    };

    if (node.label === label && isDeepStrictEqual(node.config, config)) {
      return node;
    }

    return {
      ...node,
      label,
      config
    };
  }

  const analysisExcluded =
    node.config["analysisExcluded"] === true || context.reviewOnlyResourceIds.has(resource.id);
  const label =
    context.displayNameByProviderResourceId.get(resource.providerResourceId) ??
    createAwsResourceDisplayName(resource);
  const config = {
    ...resource.config,
    ...node.config,
    providerResourceType: resource.providerResourceType,
    providerResourceId: resource.providerResourceId,
    analysisExcluded
  };

  if (node.label === label && isDeepStrictEqual(node.config, config)) {
    return node;
  }

  return {
    ...node,
    label,
    config
  };
}

function findCorrelatedDiscoveredResource(
  node: ArchitectureJson["nodes"][number],
  context: ReadCompatibilityNormalizationContext
): DiscoveredResource | null {
  const idMatch = context.discoveredResourceById.get(node.id);
  const nodeProviderResourceId = readNonEmptyConfigString(
    node.config["providerResourceId"]
  );
  const providerResourceIdMatch = nodeProviderResourceId
    ? context.discoveredResourceByProviderResourceId.get(nodeProviderResourceId)
    : undefined;

  if (idMatch === null || providerResourceIdMatch === null) {
    return null;
  }

  if (idMatch && providerResourceIdMatch && idMatch !== providerResourceIdMatch) {
    return null;
  }

  if (idMatch && nodeProviderResourceId && idMatch.providerResourceId !== nodeProviderResourceId) {
    return null;
  }

  const resource = providerResourceIdMatch ?? idMatch;

  return resource && isUniquelyIndexedDiscoveredResource(resource, context) ? resource : null;
}

function isUniquelyIndexedDiscoveredResource(
  resource: DiscoveredResource,
  context: ReadCompatibilityNormalizationContext
): boolean {
  return (
    context.discoveredResourceById.get(resource.id) === resource &&
    context.discoveredResourceByProviderResourceId.get(resource.providerResourceId) === resource
  );
}

function createFailClosedLegacyNodeLabel(
  node: ArchitectureJson["nodes"][number]
): string {
  const label = node.label?.trim() || node.id;
  const providerResourceId = label.startsWith("arn:")
    ? label
    : readNonEmptyConfigString(node.config["providerResourceId"]) ?? node.id;
  const providerResourceType =
    readNonEmptyConfigString(node.config["providerResourceType"]) ?? `AWS::${node.type}`;

  return createAwsResourceDisplayName({
    displayName: label,
    providerResourceId,
    providerResourceType
  });
}

function readNonEmptyConfigString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isReviewOnlyDiscoveredResource(resource: DiscoveredResource): boolean {
  return resource.resourceType === "UNKNOWN" || resource.analysisExcluded === true;
}

function normalizeReadCompatibilityDraft(
  draft: ReverseEngineeringDraft,
  context: ReadCompatibilityNormalizationContext
): ReverseEngineeringDraft {
  const architectureJson = normalizeReadCompatibilityArchitecture(draft.architectureJson, context);

  return architectureJson === draft.architectureJson ? draft : { ...draft, architectureJson };
}

function createReadCompatibilityDraft(
  scan: ReverseEngineeringScan,
  architectureJson: ArchitectureJson
): ReverseEngineeringDraft {
  return {
    id: `draft-${scan.id}`,
    scanId: scan.id,
    architectureJson,
    protectedValueKeys: [...REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS],
    editableValueKeys: [...REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS],
    createdAt: scan.completedAt ?? scan.updatedAt
  };
}

function isUsableReverseEngineeringDraft(
  value: unknown,
  scanId: string
): value is ReverseEngineeringDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    value.scanId === scanId &&
    isArchitectureJson(value.architectureJson) &&
    isStringArray(value.protectedValueKeys) &&
    isStringArray(value.editableValueKeys) &&
    isNonEmptyString(value.createdAt)
  );
}

function sanitizeImportSuggestions(
  context: ReadCompatibilityNormalizationContext,
  importSuggestions: ReverseEngineeringImportSuggestion[]
): ReverseEngineeringImportSuggestion[] {
  return importSuggestions.map((suggestion) => {
    const resource = context.discoveredResourceById.get(suggestion.resourceId);
    const isExecutableResource =
      resource !== undefined &&
      resource !== null &&
      isUniquelyIndexedDiscoveredResource(resource, context) &&
      !context.reviewOnlyResourceIds.has(resource.id);

    if (isExecutableResource || !hasUnsafeImportHandoff(suggestion)) {
      return suggestion;
    }

    return {
      id: suggestion.id,
      resourceId: suggestion.resourceId,
      status: "manual_review",
      handoffReady: false,
      reason: suggestion.reason ?? "검토 전용 Resource는 Terraform import 또는 배포에 사용할 수 없습니다."
    };
  });
}

function hasUnsafeImportHandoff(suggestion: ReverseEngineeringImportSuggestion): boolean {
  return (
    suggestion.status === "ready" ||
    suggestion.handoffReady ||
    suggestion.terraformAddress !== undefined ||
    suggestion.importCommand !== undefined ||
    suggestion.terraformBlockDraft !== undefined
  );
}

function isArchitectureJson(value: unknown): value is ArchitectureJson {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isArchitectureResourceNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isArchitectureResourceEdge)
  );
}

function isArchitectureResourceNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isResourceType(value.type) &&
    isFiniteNumber(value.positionX) &&
    isFiniteNumber(value.positionY) &&
    isRecord(value.config) &&
    isOptionalString(value.label)
  );
}

function isArchitectureResourceEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.sourceId) &&
    isNonEmptyString(value.targetId) &&
    isOptionalString(value.label)
  );
}

function isResourceType(value: unknown): value is ArchitectureJson["nodes"][number]["type"] {
  return typeof value === "string" && RESOURCE_TYPE_SET.has(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 스캔 row는 있지만 Provider 호출이 실패한 경우 404와 구분하기 위해 따로 던집니다.
export class ReverseEngineeringScanFailedError extends Error {
  readonly internalCode: ReverseEngineeringConnectionFailureClassification["internalCode"];
  readonly publicReason: ReverseEngineeringConnectionFailureClassification["publicReason"];

  // gg: 공개 Error에는 안전한 문장과 다음 행동 분류만 남깁니다.
  constructor(classification: ReverseEngineeringConnectionFailureClassification) {
    super(classification.publicMessage);
    this.name = "ReverseEngineeringScanFailedError";
    this.internalCode = classification.internalCode;
    this.publicReason = classification.publicReason;
  }
}

class ReverseEngineeringScanCancelledError extends Error {
  constructor() {
    super("Reverse Engineering 스캔이 취소됐습니다.");
    this.name = "ReverseEngineeringScanCancelledError";
  }
}

const PREVIEW_SCAN_PROJECT_ID = "00000000-0000-4000-8000-000000000000";

// 새 프로젝트를 만들기 전 AWS를 먼저 읽기 위한 저장하지 않는 preview scan입니다.
export async function createReverseEngineeringPreviewScan(
  input: CreateReverseEngineeringPreviewScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<{ scan: ReverseEngineeringScan; result: ReverseEngineeringScanResult }> {
  const awsConnection = await repository.findVerifiedAwsConnection(
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new ReverseEngineeringNotFoundError("AWS connection not found");
  }

  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? randomUUID;
  const startedAt = now();
  const completedAt = now();
  const scan: ReverseEngineeringScan = {
    id: generateId(),
    projectId: PREVIEW_SCAN_PROJECT_ID,
    awsConnectionId: input.awsConnectionId,
    provider: "aws",
    region: input.region,
    resourceTypes: input.resourceTypes,
    status: "completed",
    createdAt: startedAt.toISOString(),
    updatedAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  try {
    const adapter =
      options.adapter ??
      createAwsProviderAdapter(createAwsReverseEngineeringGateway(awsConnection));
    const adapterResult = await adapter.scan({
      provider: "aws",
      region: input.region,
      resourceTypes: input.resourceTypes
    });
    const publicAdapterResult = normalizePublicAdapterResult(adapterResult);
    const result: ReverseEngineeringScanResult = {
      ...publicAdapterResult,
      scan,
      reverseEngineeringDraft: {
        ...publicAdapterResult.reverseEngineeringDraft,
        id: `draft-${scan.id}`,
        scanId: scan.id,
        createdAt: scan.completedAt ?? scan.updatedAt
      }
    };

    return {
      scan,
      result
    };
  } catch (error) {
    throw new ReverseEngineeringScanFailedError(
      classifyReverseEngineeringConnectionFailure(error)
    );
  }
}

// gg: 알 수 없는 adapter 오류도 저장 가능한 고정 문장으로만 바꿉니다.
function toErrorSummary(error: unknown): string {
  return classifyReverseEngineeringConnectionFailure(error).publicMessage;
}

// 스캔 생성부터 결과 저장까지 한 번에 처리하는 서비스 진입점입니다.
export async function createReverseEngineeringScan(
  input: CreateReverseEngineeringScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<{ scan: ReverseEngineeringScan; result: ReverseEngineeringScanResult }> {
  const job = await createReverseEngineeringScanJob(input, repository, options);
  const result = await job.run();

  return {
    scan: result.scan,
    result
  };
}

// API가 먼저 running scanId를 돌려주고, 실제 AWS 조회는 별도 작업으로 이어가게 나눕니다.
export async function createReverseEngineeringScanJob(
  input: CreateReverseEngineeringScanInput,
  repository: ReverseEngineeringRepository,
  options: ReverseEngineeringServiceOptions = {}
): Promise<ReverseEngineeringScanJob> {
  const project = await repository.findAccessibleProject(input.projectId, input.accessContext);

  if (!project) {
    throw new ReverseEngineeringNotFoundError("Project not found");
  }

  const awsConnection = await repository.findVerifiedAwsConnection(
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new ReverseEngineeringNotFoundError("AWS connection not found");
  }

  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? randomUUID;
  const startedAt = now();
  const scan = await repository.createScan({
    id: generateId(),
    projectId: input.projectId,
    awsConnectionId: input.awsConnectionId,
    provider: "aws",
    region: input.region,
    resourceTypes: input.resourceTypes,
    status: "running",
    startedAt,
    createdAt: startedAt,
    updatedAt: startedAt
  });

  await appendUserFacingLog(repository, scan.id, "Reverse Engineering 스캔을 시작했습니다.", {
    generateId,
    now,
    sequence: 1
  });

  return {
    scan: toReverseEngineeringScan(scan),
    run: () =>
      runReverseEngineeringScanJob({
        awsConnection,
        generateId,
        input,
        now,
        options,
        repository,
        scan
      })
  };
}

// running 상태로 만들어둔 scan을 실제 Provider Adapter로 완료 또는 실패 처리합니다.
async function runReverseEngineeringScanJob({
  awsConnection,
  generateId,
  input,
  now,
  options,
  repository,
  scan
}: {
  awsConnection: AwsConnection;
  generateId: () => string;
  input: CreateReverseEngineeringScanInput;
  now: () => Date;
  options: ReverseEngineeringServiceOptions;
  repository: ReverseEngineeringRepository;
  scan: ReverseEngineeringScanRecord;
}): Promise<ReverseEngineeringScanResult> {
  try {
    const adapter =
      options.adapter ??
      createAwsProviderAdapter(createAwsReverseEngineeringGateway(awsConnection));
    const adapterResult = await adapter.scan({
      provider: "aws",
      region: input.region,
      resourceTypes: input.resourceTypes
    });
    const publicAdapterResult = normalizePublicAdapterResult(adapterResult);
    const completedAt = now();
    const completedScan = toReverseEngineeringScan({
      ...scan,
      status: "completed",
      completedAt,
      updatedAt: completedAt
    });
    const result: ReverseEngineeringScanResult = {
      ...publicAdapterResult,
      scan: completedScan,
      reverseEngineeringDraft: {
        ...publicAdapterResult.reverseEngineeringDraft,
        id: `draft-${completedScan.id}`,
        scanId: completedScan.id,
        createdAt: completedScan.completedAt ?? completedScan.updatedAt
      }
    };
    const savedScan = await repository.completeScan(scan.id, result, completedAt);

    if (!savedScan) {
      await throwIfScanWasCancelled(repository, input, scan.id, generateId, now);
      throw new ReverseEngineeringNotFoundError("Reverse Engineering scan not found");
    }

    await appendUserFacingLog(repository, scan.id, "Reverse Engineering 스캔이 완료됐습니다.", {
      generateId,
      now,
      sequence: 2
    });

    return {
      ...result,
      scan: toReverseEngineeringScan(savedScan)
    };
  } catch (error) {
    if (error instanceof ReverseEngineeringScanCancelledError) {
      throw error;
    }

    const failedAt = now();
    const errorSummary = toErrorSummary(error);
    const failedScan = await repository.failScan(scan.id, errorSummary, failedAt);

    await appendUserFacingLog(repository, scan.id, `Reverse Engineering 스캔이 실패했습니다. ${errorSummary}`, {
      generateId,
      now,
      sequence: 2,
      level: "ERROR"
    });

    if (!failedScan) {
      throw new ReverseEngineeringNotFoundError("Reverse Engineering scan not found");
    }

    throw new ReverseEngineeringScanFailedError(
      classifyReverseEngineeringConnectionFailure(error)
    );
  }
}

// gg: 주입된 adapter와 과거 구현도 API 응답·저장 전에 같은 공개 오류 계약으로 줄입니다.
function normalizePublicAdapterResult(
  result: ReverseEngineeringScanResult
): ReverseEngineeringScanResult {
  return normalizeReverseEngineeringScanResult(result.scan, result);
}

export function createPostgresReverseEngineeringRepository(
  db: Database
): ReverseEngineeringRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async findVerifiedAwsConnection(awsConnectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, awsConnectionId),
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.status, "verified")
          )
        );

      return awsConnection ? toAwsConnection(awsConnection) : undefined;
    },

    async createScan(input) {
      const [scan] = await db.insert(reverseEngineeringScans).values(input).returning();

      if (!scan) {
        throw new Error("Reverse Engineering scan creation failed");
      }

      return scan;
    },

    async completeScan(scanId, result, completedAt) {
      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          status: "completed",
          result,
          completedAt,
          updatedAt: completedAt
        })
        .where(and(eq(reverseEngineeringScans.id, scanId), eq(reverseEngineeringScans.status, "running")))
        .returning();

      return scan;
    },

    async failScan(scanId, errorSummary, failedAt) {
      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          status: "failed",
          errorSummary,
          completedAt: failedAt,
          updatedAt: failedAt
        })
        .where(eq(reverseEngineeringScans.id, scanId))
        .returning();

      return scan;
    },

    async findAccessibleScan(projectId, scanId, accessContext) {
      const [scan] = await db
        .select()
        .from(reverseEngineeringScans)
        .innerJoin(projects, eq(reverseEngineeringScans.projectId, projects.id))
        .where(
          and(
            eq(reverseEngineeringScans.id, scanId),
            eq(reverseEngineeringScans.projectId, projectId),
            eq(projects.userId, accessContext.userId),
            isNull(reverseEngineeringScans.deletedAt)
          )
        );

      return scan?.reverse_engineering_scans;
    },

    async listScansByProject(projectId, accessContext) {
      const rows = await db
        .select()
        .from(reverseEngineeringScans)
        .innerJoin(projects, eq(reverseEngineeringScans.projectId, projects.id))
        .where(
          and(
            eq(reverseEngineeringScans.projectId, projectId),
            eq(projects.userId, accessContext.userId),
            isNull(reverseEngineeringScans.deletedAt)
          )
        )
        .orderBy(desc(reverseEngineeringScans.createdAt));

      return rows.map((row) => row.reverse_engineering_scans);
    },

    async requestScanCancellation(projectId, scanId, accessContext, requestedAt) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return undefined;
      }

      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          cancelRequestedAt: requestedAt,
          status: existingScan.status === "running" ? "cancelled" : existingScan.status,
          updatedAt: requestedAt
        })
        .where(eq(reverseEngineeringScans.id, existingScan.id))
        .returning();

      return scan;
    },

    async softDeleteScan(projectId, scanId, accessContext, deletedAt) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return undefined;
      }

      await db.delete(reverseEngineeringScanLogs).where(eq(reverseEngineeringScanLogs.scanId, existingScan.id));

      const [scan] = await db
        .update(reverseEngineeringScans)
        .set({
          deletedAt,
          errorSummary: null,
          result: null,
          updatedAt: deletedAt
        })
        .where(eq(reverseEngineeringScans.id, existingScan.id))
        .returning();

      return scan;
    },

    async appendScanLog(input) {
      const [log] = await db.insert(reverseEngineeringScanLogs).values(input).returning();

      if (!log) {
        throw new Error("Reverse Engineering scan log creation failed");
      }

      return log;
    },

    async listScanLogs(projectId, scanId, accessContext) {
      const existingScan = await this.findAccessibleScan(projectId, scanId, accessContext);

      if (!existingScan) {
        return [];
      }

      return db
        .select()
        .from(reverseEngineeringScanLogs)
        .where(eq(reverseEngineeringScanLogs.scanId, existingScan.id))
        .orderBy(asc(reverseEngineeringScanLogs.sequence));
    }
  };
}

// 취소 요청이 들어온 scan은 완료 결과로 저장하지 않고 cancelled 상태를 유지합니다.
async function throwIfScanWasCancelled(
  repository: ReverseEngineeringRepository,
  input: CreateReverseEngineeringScanInput,
  scanId: string,
  generateId: () => string,
  now: () => Date
): Promise<void> {
  const latestScan = await repository.findAccessibleScan(input.projectId, scanId, input.accessContext);

  if (latestScan?.status !== "cancelled") {
    return;
  }

  await appendUserFacingLog(repository, scanId, "Reverse Engineering 스캔이 취소됐습니다.", {
    generateId,
    now,
    sequence: 2,
    level: "WARN"
  });
  throw new ReverseEngineeringScanCancelledError();
}

export function toReverseEngineeringScan(row: ReverseEngineeringScanRecord): ReverseEngineeringScan {
  return {
    id: row.id,
    projectId: row.projectId,
    awsConnectionId: row.awsConnectionId,
    provider: "aws",
    region: row.region,
    resourceTypes: row.resourceTypes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary ? sanitizeHistoricalErrorSummary(row.errorSummary) : null
  };
}

export function toReverseEngineeringScanLogLine(
  row: ReverseEngineeringScanLogRecord
): ReverseEngineeringScanLogLine {
  return {
    id: row.id,
    scanId: row.scanId,
    sequence: row.sequence,
    stage: row.stage,
    level: row.level,
    message: row.level === "ERROR"
      ? "Reverse Engineering 스캔을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
      : row.message,
    createdAt: row.createdAt.toISOString()
  };
}

// gg: 과거 저장 row의 원문 오류도 읽는 순간 고정 문장으로 바꿉니다.
function sanitizeHistoricalErrorSummary(_errorSummary: string): string {
  return "AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function toAwsConnection(row: typeof awsConnections.$inferSelect): AwsConnection {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    roleArn: row.roleArn,
    externalId: row.externalId,
    region: row.region,
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function appendUserFacingLog(
  repository: ReverseEngineeringRepository,
  scanId: string,
  message: string,
  options: {
    generateId: () => string;
    now: () => Date;
    sequence: number;
    level?: ReverseEngineeringScanLogLevel;
  }
): Promise<ReverseEngineeringScanLogRecord> {
  return repository.appendScanLog({
    id: options.generateId(),
    scanId,
    sequence: options.sequence,
    stage: "provider_api",
    level: options.level ?? "INFO",
    message,
    createdAt: options.now()
  });
}
