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
  const seenPhysicalResourceKeys = new Set<string>();

  for (const target of sortedTargets) {
    assertVerifiedTerraformImportTarget(target, seenAddresses, seenPhysicalResourceKeys);
    seenAddresses.add(target.terraformAddress);
    seenPhysicalResourceKeys.add(createPhysicalResourceKey(target));
  }

  return sortedTargets
    .map((target) =>
      [
        "import {",
        `  to = ${target.terraformAddress}`,
        `  id = ${encodeHclQuotedString(target.importId)}`,
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
  seenPhysicalResourceKeys: ReadonlySet<string>
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

  if (seenPhysicalResourceKeys.has(createPhysicalResourceKey(target))) {
    throw new Error("같은 AWS 리소스를 여러 Terraform 주소로 import할 수 없습니다.");
  }
}

/** gg: 서로 다른 AWS 종류가 우연히 같은 이름을 써도 별도 리소스로 구분합니다. */
function createPhysicalResourceKey(target: VerifiedTerraformImportTarget): string {
  return `${target.providerResourceType}\0${target.importId}`;
}

/** gg: import ID를 평가하지 않는 HCL quoted string으로 바꾸고 표현할 수 없는 제어문자를 막습니다. */
function encodeHclQuotedString(value: string): string {
  if (hasUnsupportedHclControlCharacter(value)) {
    throw new Error("HCL 문자열에 사용할 수 없는 제어문자가 있습니다.");
  }

  const escapedValue = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replace(/\$\{/gu, () => "$${")
    .replace(/%\{/gu, () => "%%{");

  return `"${escapedValue}"`;
}

/** gg: HCL이 직접 표현하지 못하는 제어문자만 걸러내고 tab·줄바꿈·carriage return은 escape를 허용합니다. */
function hasUnsupportedHclControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    return (
      codePoint <= 0x08 ||
      (codePoint >= 0x0b && codePoint <= 0x0c) ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    );
  });
}
