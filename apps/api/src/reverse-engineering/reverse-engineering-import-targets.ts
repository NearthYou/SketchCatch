import type {
  DiagramJson,
  DiagramNode,
  ReverseEngineeringImportDecision,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import type { VerifiedTerraformImportTarget } from "../services/terraform/terraform-import-blocks.js";
import {
  ReverseEngineeringImportDependencyError,
  validateReverseEngineeringImportDependencies
} from "./reverse-engineering-import-dependency.js";
import { createReverseEngineeringTerraformProjection } from "./reverse-engineering-terraform-projection.js";

export type ReverseEngineeringImportScanRecord = {
  id: string;
  projectId: string;
  status: string;
  result: ReverseEngineeringScanResult | null;
};

export type ReverseEngineeringImportTargetRepository = {
  findAccessibleScan(
    projectId: string,
    scanId: string,
    accessContext: ProjectAccessContext
  ): Promise<ReverseEngineeringImportScanRecord | undefined>;
};

export type ResolveVerifiedImportTargetsInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  diagramJson: DiagramJson;
};

export class ReverseEngineeringImportTargetVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReverseEngineeringImportTargetVerificationError";
  }
}

/** Persisted source metadata, including damaged partial metadata, activates the server-owned boundary. */
export function hasReverseEngineeringSourceProvenance(diagramJson: DiagramJson): boolean {
  return diagramJson.nodes.some((node) => readNodeSource(node) !== null);
}

/** gg: 보드 metadata를 서버에 저장된 원본 scan과 다시 맞춰 안전한 import 대상만 반환합니다. */
export async function resolveVerifiedImportTargets(
  input: ResolveVerifiedImportTargetsInput,
  repository: ReverseEngineeringImportTargetRepository
): Promise<VerifiedTerraformImportTarget[]> {
  const sourcedNodes = input.diagramJson.nodes.flatMap((node) => {
    const source = readNodeSource(node);
    return source ? [{ node, source }] : [];
  });
  const scans = new Map<string, ReverseEngineeringImportScanRecord>();
  const verifiedNodes: Array<{
    node: DiagramNode;
    source: { scanId: string; draftId: string };
    scan: ReverseEngineeringImportScanRecord & { result: ReverseEngineeringScanResult };
  }> = [];

  for (const { node, source } of sourcedNodes) {
    const scan =
      scans.get(source.scanId) ??
      (await repository.findAccessibleScan(input.projectId, source.scanId, input.accessContext));

    if (
      !scan ||
      scan.id !== source.scanId ||
      scan.projectId !== input.projectId ||
      scan.status !== "completed" ||
      !scan.result
    ) {
      throw new ReverseEngineeringImportTargetVerificationError(
        "적용한 AWS 원본 scan을 확인할 수 없습니다."
      );
    }
    if (!hasConsistentStoredIdentity(scan, source)) {
      throw new ReverseEngineeringImportTargetVerificationError(
        "보드와 저장된 AWS 원본이 달라 다시 가져와야 합니다."
      );
    }
    scans.set(source.scanId, scan);

    verifiedNodes.push({
      node,
      source,
      scan: scan as ReverseEngineeringImportScanRecord & {
        result: ReverseEngineeringScanResult;
      }
    });
  }

  validateVerifiedNodeDependencies(verifiedNodes);

  return verifiedNodes.flatMap(({ node, source, scan }) => {
    const target = resolveNodeImportTarget(node, source.draftId, scan.result);
    return target ? [target] : [];
  });
}

/** gg: import block을 만들기 전에 scan별 서버 결정과 same-scan Terraform 의존성을 다시 확인합니다. */
function validateVerifiedNodeDependencies(
  verifiedNodes: readonly {
    node: DiagramNode;
    scan: ReverseEngineeringImportScanRecord & { result: ReverseEngineeringScanResult };
  }[]
): void {
  const selectedResourceIdsByScanId = new Map<string, Set<string>>();
  const scanResultByScanId = new Map<string, ReverseEngineeringScanResult>();

  for (const { node, scan } of verifiedNodes) {
    const decision = readServerConfirmedImportDecision(node);
    scanResultByScanId.set(scan.id, scan.result);
    if (decision.mode !== "import_existing") {
      continue;
    }
    const selectedResourceIds = selectedResourceIdsByScanId.get(scan.id) ?? new Set<string>();
    selectedResourceIds.add(node.id);
    selectedResourceIdsByScanId.set(scan.id, selectedResourceIds);
  }

  for (const [scanId, scanResult] of scanResultByScanId) {
    try {
      validateReverseEngineeringImportDependencies({
        storedScanResult: scanResult,
        importExistingResourceIds: [...(selectedResourceIdsByScanId.get(scanId) ?? [])]
      });
    } catch (error) {
      if (error instanceof ReverseEngineeringImportDependencyError) {
        throw new ReverseEngineeringImportTargetVerificationError(error.message);
      }
      throw error;
    }
  }
}

/** gg: source metadata가 일부만 남은 손상 node는 일반 새 리소스로 오인하지 않고 중단합니다. */
function readNodeSource(node: DiagramNode): { scanId: string; draftId: string } | null {
  const values = node.parameters?.values;
  const scanId = readNonEmptyString(values?.["reverseEngineeringSourceScanId"]);
  const draftId = readNonEmptyString(values?.["reverseEngineeringDraftId"]);
  const sourceKind = readNonEmptyString(values?.["reverseEngineeringSourceKind"]);

  if (!scanId && !draftId && !sourceKind) {
    if (hasReverseEngineeringProjectionMarker(node)) {
      throw new ReverseEngineeringImportTargetVerificationError(
        "보드의 AWS 원본 정보가 제거됐습니다. 다시 가져와 주세요."
      );
    }
    return null;
  }

  if (!scanId || !draftId || sourceKind !== "saved_scan") {
    throw new ReverseEngineeringImportTargetVerificationError(
      "보드가 저장된 AWS 원본을 가리키지 않습니다. 다시 가져와 주세요."
    );
  }

  return { scanId, draftId };
}

/** gg: provenance가 지워져도 서버가 붙인 관리·파일 marker가 남아 있으면 새 Resource로 오인하지 않습니다. */
function hasReverseEngineeringProjectionMarker(node: DiagramNode): boolean {
  const values = node.parameters?.values;
  const management = values?.["reverseEngineeringManagement"];

  return (
    management === "managed" ||
    management === "reference" ||
    management === "aws_managed" ||
    management === "sketchcatch_managed" ||
    management === "needs_mapping" ||
    node.parameters?.fileName === "reverse-engineering" ||
    values?.["terraformFileName"] === "reverse-engineering" ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringObservedConfig")
  );
}

/** gg: DB row와 그 안의 private result/draft가 같은 Project scan을 가리킬 때만 신뢰합니다. */
function hasConsistentStoredIdentity(
  scan: ReverseEngineeringImportScanRecord,
  source: { scanId: string; draftId: string }
): boolean {
  const result = scan.result;

  return Boolean(
    result &&
    result.scan.id === scan.id &&
    result.scan.projectId === scan.projectId &&
    result.scan.status === "completed" &&
    result.reverseEngineeringDraft.id === source.draftId &&
    result.reverseEngineeringDraft.scanId === scan.id
  );
}

/** gg: 서버가 확인한 사용자 선택과 저장 suggestion이 모두 같을 때만 import 대상을 만듭니다. */
function resolveNodeImportTarget(
  node: DiagramNode,
  draftId: string,
  result: ReverseEngineeringScanResult
): VerifiedTerraformImportTarget | null {
  if (result.reverseEngineeringDraft.id !== draftId) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "보드와 저장된 AWS 원본이 달라 다시 가져와야 합니다."
    );
  }

  const resources = result.discoveredResources.filter((resource) => resource.id === node.id);
  if (resources.length !== 1) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "보드 리소스와 저장된 AWS 원본을 하나로 확인하지 못했습니다."
    );
  }
  const resource = resources[0]!;
  const suggestions = result.importSuggestions.filter(
    (suggestion) => suggestion.resourceId === resource.id
  );
  const suggestion = suggestions.length === 1 ? suggestions[0] : undefined;
  const decision = readServerConfirmedImportDecision(node);

  if (!suggestion || decision.statusAtConfirmation !== suggestion.status) {
    throw new ReverseEngineeringImportTargetVerificationError(
      `${resource.displayName} 리소스의 가져오기 선택이 저장된 AWS 원본과 다릅니다.`
    );
  }

  if (decision.mode === "observe_only") {
    return null;
  }

  const management = createReverseEngineeringTerraformProjection(
    resource,
    result.discoveredResources
  ).management;
  if (
    management !== "managed" ||
    suggestion.status !== "ready" ||
    suggestion.handoffReady !== true ||
    !suggestion.terraformAddress ||
    !suggestion.importCommand
  ) {
    throw new ReverseEngineeringImportTargetVerificationError(
      `${resource.displayName} 리소스를 아직 안전하게 가져올 수 없습니다.`
    );
  }

  const currentAddress = readNodeTerraformAddress(node);
  if (currentAddress !== suggestion.terraformAddress) {
    throw new ReverseEngineeringImportTargetVerificationError(
      `${resource.displayName} 리소스의 Terraform 주소가 원본과 다릅니다.`
    );
  }

  return {
    resourceId: resource.id,
    terraformAddress: suggestion.terraformAddress,
    importId: readCanonicalImportId(suggestion.importCommand, suggestion.terraformAddress),
    providerResourceType: resource.providerResourceType,
    resourceType: resource.resourceType
  };
}

/** gg: import 결정은 서버가 저장한 exact shape만 허용해 누락·위조된 과거 Board를 배포에서 차단합니다. */
function readServerConfirmedImportDecision(node: DiagramNode): ReverseEngineeringImportDecision {
  const decision = node.metadata?.reverseEngineering?.importDecision;

  if (
    !decision ||
    typeof decision !== "object" ||
    Object.keys(decision).length !== 3 ||
    decision.version !== 1 ||
    (decision.mode !== "import_existing" && decision.mode !== "observe_only") ||
    (decision.statusAtConfirmation !== "ready" &&
      decision.statusAtConfirmation !== "manual_review" &&
      decision.statusAtConfirmation !== "unsupported_resource_type")
  ) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "기존 AWS 리소스의 가져오기 선택을 확인할 수 없습니다. 다시 가져와 주세요."
    );
  }

  if (decision.mode === "import_existing" && decision.statusAtConfirmation !== "ready") {
    throw new ReverseEngineeringImportTargetVerificationError(
      "바로 관리할 수 없는 AWS 리소스는 기존 리소스로 가져올 수 없습니다."
    );
  }

  return decision;
}

/** gg: 현재 보드가 가리키는 정적 resource 주소만 원본 suggestion과 비교합니다. */
function readNodeTerraformAddress(node: DiagramNode): string {
  if (!node.parameters || node.parameters.terraformBlockType !== "resource") {
    throw new ReverseEngineeringImportTargetVerificationError(
      "기존 AWS 리소스는 Terraform resource로만 관리할 수 있습니다."
    );
  }

  const resourceType = readNonEmptyString(node.parameters.resourceType);
  const resourceName = readNonEmptyString(node.parameters.resourceName);
  if (!resourceType || !resourceName) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "기존 AWS 리소스의 Terraform 주소를 확인할 수 없습니다."
    );
  }

  return `${resourceType}.${resourceName}`;
}

/** gg: 브라우저 명령은 받지 않고 서버 저장 suggestion의 고정 prefix 뒤 import ID만 읽습니다. */
function readCanonicalImportId(importCommand: string, terraformAddress: string): string {
  const prefix = `terraform import ${terraformAddress} `;
  if (!importCommand.startsWith(prefix)) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "저장된 AWS import 정보가 올바르지 않습니다."
    );
  }

  const importId = importCommand.slice(prefix.length);
  if (importId.trim().length === 0 || importId !== importId.trim()) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "저장된 AWS import ID를 확인할 수 없습니다."
    );
  }

  return importId;
}

/** gg: 공백뿐인 source 식별자는 없는 값으로 취급합니다. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
