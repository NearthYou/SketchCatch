import type {
  DiagramJson,
  DiagramNode,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import type { VerifiedTerraformImportTarget } from "../services/terraform/terraform-import-blocks.js";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";

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
  const targets: VerifiedTerraformImportTarget[] = [];

  for (const { node, source } of sourcedNodes) {
    const scan =
      scans.get(source.scanId) ??
      (await repository.findAccessibleScan(
        input.projectId,
        source.scanId,
        input.accessContext
      ));

    if (
      !scan ||
      scan.projectId !== input.projectId ||
      scan.status !== "completed" ||
      !scan.result
    ) {
      throw new ReverseEngineeringImportTargetVerificationError(
        "적용한 AWS 원본 scan을 확인할 수 없습니다."
      );
    }
    scans.set(source.scanId, scan);

    const target = resolveNodeImportTarget(node, source.draftId, scan.result);
    if (target) {
      targets.push(target);
    }
  }

  return targets;
}

/** gg: source metadata가 일부만 남은 손상 node는 일반 새 리소스로 오인하지 않고 중단합니다. */
function readNodeSource(
  node: DiagramNode
): { scanId: string; draftId: string } | null {
  const values = node.parameters?.values;
  const scanId = readNonEmptyString(values?.["reverseEngineeringSourceScanId"]);
  const draftId = readNonEmptyString(values?.["reverseEngineeringDraftId"]);

  if (!scanId && !draftId) {
    return null;
  }

  if (!scanId || !draftId) {
    throw new ReverseEngineeringImportTargetVerificationError(
      "보드의 AWS 원본 정보가 완전하지 않습니다. 다시 가져와 주세요."
    );
  }

  return { scanId, draftId };
}

/** gg: 보호 리소스는 제외하고 관리 대상은 저장된 suggestion과 주소가 모두 같아야 허용합니다. */
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
  const management = classifyReverseEngineeringManagement(resource);

  if (management !== "managed") {
    return null;
  }

  const suggestions = result.importSuggestions.filter(
    (suggestion) => suggestion.resourceId === resource.id
  );
  const suggestion = suggestions.length === 1 ? suggestions[0] : undefined;
  if (
    !suggestion ||
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
