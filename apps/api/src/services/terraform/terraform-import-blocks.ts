import type { ResourceType } from "@sketchcatch/types";

export type VerifiedTerraformImportTarget = {
  resourceId: string;
  terraformAddress: string;
  importId: string;
  providerResourceType: string;
  resourceType: ResourceType;
};

const TERRAFORM_RESOURCE_ADDRESS_PATTERN = /^aws_[a-z0-9_]+\.[a-z_][a-z0-9_]*$/u;
const MAX_IMPORT_ID_LENGTH = 2_048;

/** gg: 서버가 검증한 기존 AWS 식별자만 결정적인 Terraform import block으로 바꿉니다. */
export function createTerraformImportBlocks(
  targets: readonly VerifiedTerraformImportTarget[]
): string {
  const sortedTargets = [...targets].sort((left, right) =>
    left.terraformAddress.localeCompare(right.terraformAddress, "en")
  );
  const seenAddresses = new Set<string>();
  const seenImportIds = new Set<string>();

  for (const target of sortedTargets) {
    assertVerifiedTerraformImportTarget(target, seenAddresses, seenImportIds);
    seenAddresses.add(target.terraformAddress);
    seenImportIds.add(target.importId);
  }

  return sortedTargets
    .map((target) =>
      [
        "import {",
        `  to = ${target.terraformAddress}`,
        `  id = ${JSON.stringify(target.importId)}`,
        "}",
        ""
      ].join("\n")
    )
    .join("\n");
}

/** gg: module·data·동적 index를 막고 한 실제 리소스를 한 주소에만 연결합니다. */
function assertVerifiedTerraformImportTarget(
  target: VerifiedTerraformImportTarget,
  seenAddresses: ReadonlySet<string>,
  seenImportIds: ReadonlySet<string>
): void {
  if (!TERRAFORM_RESOURCE_ADDRESS_PATTERN.test(target.terraformAddress)) {
    throw new Error("검증된 Terraform resource 주소만 import할 수 있습니다.");
  }

  if (seenAddresses.has(target.terraformAddress)) {
    throw new Error("같은 Terraform 주소를 두 번 import할 수 없습니다.");
  }

  if (
    target.importId.trim().length === 0 ||
    target.importId !== target.importId.trim() ||
    target.importId.length > MAX_IMPORT_ID_LENGTH ||
    target.importId.includes("\0")
  ) {
    throw new Error("검증된 AWS import ID가 필요합니다.");
  }

  if (seenImportIds.has(target.importId)) {
    throw new Error("같은 AWS 리소스를 여러 Terraform 주소로 import할 수 없습니다.");
  }
}
