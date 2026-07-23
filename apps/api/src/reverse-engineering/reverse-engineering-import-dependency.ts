import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createReverseEngineeringTerraformProjection,
  createStableTerraformResourceName,
  getReverseEngineeringTerraformResourceType
} from "./reverse-engineering-terraform-projection.js";

const TERRAFORM_TRAVERSAL_SUFFIX_PATTERN =
  /^[a-z_][a-z0-9_]*(?:(?:\.[a-z_][a-z0-9_]*)|(?:\[[^\]\r\n]+\]))*$/iu;

export type ValidateReverseEngineeringImportDependenciesInput = {
  storedScanResult: ReverseEngineeringScanResult;
  importExistingResourceIds: readonly string[];
};

export class ReverseEngineeringImportDependencyError extends Error {
  readonly sourceResourceId: string | null;
  readonly missingResourceIds: readonly string[];

  /** gg: 사용자에게 함께 선택할 리소스를 알려주면서 서버 판별용 ID도 보존합니다. */
  constructor({
    message,
    sourceResourceId = null,
    missingResourceIds = []
  }: {
    message: string;
    sourceResourceId?: string | null;
    missingResourceIds?: readonly string[];
  }) {
    super(message);
    this.name = "ReverseEngineeringImportDependencyError";
    this.sourceResourceId = sourceResourceId;
    this.missingResourceIds = [...missingResourceIds];
  }
}

/** gg: 가져올 source가 참조하는 같은 scan 리소스도 모두 함께 가져오도록 강제합니다. */
export function validateReverseEngineeringImportDependencies({
  storedScanResult,
  importExistingResourceIds
}: ValidateReverseEngineeringImportDependenciesInput): void {
  const resources = storedScanResult.discoveredResources;
  const resourceById = createUniqueResourceMap(resources);
  const terraformAddressByResourceId = createTerraformAddressMap(storedScanResult);
  const selectedResourceIds = new Set(importExistingResourceIds);

  for (const sourceResourceId of selectedResourceIds) {
    const sourceResource = resourceById.get(sourceResourceId);
    if (!sourceResource) {
      throw invalidStoredDependencyError();
    }

    const projection = createReverseEngineeringTerraformProjection(sourceResource, resources);
    const referencedResourceIds = findKnownTerraformReferenceResourceIds(
      projection.terraformValues,
      terraformAddressByResourceId
    );
    const missingResourceIds = [...referencedResourceIds].filter(
      (resourceId) => resourceId !== sourceResourceId && !selectedResourceIds.has(resourceId)
    );

    if (missingResourceIds.length === 0) {
      continue;
    }

    const missingNames = missingResourceIds.map(
      (resourceId) => resourceById.get(resourceId)?.displayName ?? resourceId
    );
    throw new ReverseEngineeringImportDependencyError({
      message: `${sourceResource.displayName} 리소스를 가져오려면 ${missingNames.join(
        ", "
      )} 리소스도 함께 선택해 주세요.`,
      sourceResourceId,
      missingResourceIds
    });
  }
}

/** gg: 중첩 object와 배열 안에서 서버가 만든 same-scan Terraform 참조만 찾습니다. */
export function findKnownTerraformReferenceResourceIds(
  value: unknown,
  terraformAddressByResourceId: ReadonlyMap<string, string>
): ReadonlySet<string> {
  const resourceIds = new Set<string>();
  collectKnownTerraformReferenceResourceIds(value, terraformAddressByResourceId, resourceIds);
  return resourceIds;
}

/** gg: source resource ID별 정적 Terraform 주소를 만들고 주소 충돌은 안전하게 거부합니다. */
export function createReverseEngineeringTerraformAddressMap(
  storedScanResult: ReverseEngineeringScanResult
): ReadonlyMap<string, string> {
  return createTerraformAddressMap(storedScanResult);
}

/** gg: 같은 scan 안에서 중복 source ID가 조용히 덮어써지지 않게 확인합니다. */
function createUniqueResourceMap(
  resources: ReverseEngineeringScanResult["discoveredResources"]
): ReadonlyMap<string, ReverseEngineeringScanResult["discoveredResources"][number]> {
  const resourceById = new Map<
    string,
    ReverseEngineeringScanResult["discoveredResources"][number]
  >();

  for (const resource of resources) {
    if (!resource.id || resourceById.has(resource.id)) {
      throw invalidStoredDependencyError();
    }
    resourceById.set(resource.id, resource);
  }

  return resourceById;
}

/** gg: source가 참조할 수 있는 모든 지원 Resource의 안정적인 주소를 dependency 후보로 등록합니다. */
function createTerraformAddressMap(
  storedScanResult: ReverseEngineeringScanResult
): ReadonlyMap<string, string> {
  const resources = storedScanResult.discoveredResources;
  const addressByResourceId = new Map<string, string>();
  const resourceIdByAddress = new Map<string, string>();

  createUniqueResourceMap(resources);
  for (const resource of resources) {
    const projection = createReverseEngineeringTerraformProjection(resource, resources);
    const terraformResourceType =
      projection.terraformResourceType ??
      getReverseEngineeringTerraformResourceType(
        resource.resourceType,
        resource.providerResourceType
      );
    if (!terraformResourceType) {
      continue;
    }

    const terraformResourceName =
      projection.terraformResourceName ?? createStableTerraformResourceName(resource.id);
    const address = `${terraformResourceType}.${terraformResourceName}`;
    const existingResourceId = resourceIdByAddress.get(address);
    if (existingResourceId && existingResourceId !== resource.id) {
      throw invalidStoredDependencyError();
    }
    resourceIdByAddress.set(address, resource.id);
    addressByResourceId.set(resource.id, address);
  }

  return addressByResourceId;
}

/** gg: 실제 AWS ID 문자열은 건드리지 않고 exact Terraform traversal만 재귀적으로 수집합니다. */
function collectKnownTerraformReferenceResourceIds(
  value: unknown,
  terraformAddressByResourceId: ReadonlyMap<string, string>,
  target: Set<string>
): void {
  if (typeof value === "string") {
    for (const [resourceId, address] of terraformAddressByResourceId) {
      if (containsTerraformReferenceToAddress(value, address)) {
        target.add(resourceId);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectKnownTerraformReferenceResourceIds(item, terraformAddressByResourceId, target);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const item of Object.values(value)) {
    collectKnownTerraformReferenceResourceIds(item, terraformAddressByResourceId, target);
  }
}

/** gg: raw traversal 또는 interpolation 안의 동일 주소만 Terraform 참조로 인정합니다. */
function containsTerraformReferenceToAddress(value: string, address: string): boolean {
  const rawPrefix = `${address}.`;
  if (
    value.startsWith(rawPrefix) &&
    TERRAFORM_TRAVERSAL_SUFFIX_PATTERN.test(value.slice(rawPrefix.length))
  ) {
    return true;
  }

  const interpolationPrefix = `\${${address}.`;
  let startIndex = value.indexOf(interpolationPrefix);
  while (startIndex >= 0) {
    const suffixStart = startIndex + interpolationPrefix.length;
    const endIndex = value.indexOf("}", suffixStart);
    if (
      endIndex >= 0 &&
      TERRAFORM_TRAVERSAL_SUFFIX_PATTERN.test(value.slice(suffixStart, endIndex))
    ) {
      return true;
    }
    startIndex = value.indexOf(interpolationPrefix, suffixStart);
  }

  return false;
}

/** gg: 손상되거나 충돌한 저장 scan은 일반 리소스처럼 진행하지 않고 다시 가져오게 합니다. */
function invalidStoredDependencyError(): ReverseEngineeringImportDependencyError {
  return new ReverseEngineeringImportDependencyError({
    message: "저장된 AWS 리소스 연결을 확인할 수 없습니다. 다시 가져와 주세요."
  });
}

/** gg: JSON object만 안전하게 순회하도록 런타임 타입을 좁힙니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
