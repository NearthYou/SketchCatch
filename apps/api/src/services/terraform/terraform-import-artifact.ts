import type { TerraformArtifactBundle, TerraformSyncFileInput } from "@sketchcatch/types";
import {
  createTerraformImportBlocks,
  type VerifiedTerraformImportTarget
} from "./terraform-import-blocks.js";

export const terraformImportsFileName = "imports.tf";
export const terraformArtifactBundleFileName = "terraform-files.json";
export const terraformArtifactBundleContentType =
  "application/vnd.sketchcatch.terraform-files+json";

/** gg: browser가 제출한 파일과 분리해 server-verified import만 예약 파일에 넣습니다. */
export function createTerraformArtifactBundleWithImports(
  baseFiles: readonly TerraformSyncFileInput[],
  targets: readonly VerifiedTerraformImportTarget[]
): TerraformArtifactBundle {
  assertSafeBaseTerraformFiles(baseFiles);
  assertTerraformBaseFilesDoNotContainImportBlocks(baseFiles);

  if (targets.length === 0) {
    throw new Error("Terraform import 대상이 없으면 reserved import bundle을 만들 수 없습니다.");
  }

  return {
    schemaVersion: 1,
    files: [
      ...baseFiles.map((file) => ({ ...file })),
      {
        fileName: terraformImportsFileName,
        terraformCode: createTerraformImportBlocks(targets)
      }
    ]
  };
}

/** gg: plan 직전에 저장 artifact의 예약 파일이 현재 persisted scan 결과와 정확히 같은지 확인합니다. */
export function assertTerraformImportArtifactMatches(
  files: readonly TerraformSyncFileInput[],
  targets: readonly VerifiedTerraformImportTarget[]
): void {
  assertTerraformBaseFilesDoNotContainImportBlocks(
    files.filter((file) => file.fileName !== terraformImportsFileName)
  );
  const importFiles = files.filter((file) => file.fileName === terraformImportsFileName);
  const expectedImportCode =
    targets.length > 0 ? createTerraformImportBlocks(targets) : undefined;

  if (expectedImportCode === undefined) {
    if (importFiles.length > 0) {
      throw new Error("서버가 검증하지 않은 Terraform import artifact입니다.");
    }
    return;
  }

  if (importFiles.length !== 1 || importFiles[0]?.terraformCode !== expectedImportCode) {
    throw new Error("저장된 Terraform import artifact가 현재 AWS 원본과 다릅니다.");
  }
}

/** gg: browser-controlled 원본 파일은 import block을 소유할 수 없습니다. */
export function assertTerraformBaseFilesDoNotContainImportBlocks(
  files: readonly TerraformSyncFileInput[]
): void {
  if (files.some((file) => containsTerraformImportBlock(file.terraformCode))) {
    throw new Error("Terraform import blocks are allowed only in server-owned imports.tf.");
  }
}

function containsTerraformImportBlock(source: string): boolean {
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (char === '"') {
      index = skipQuotedString(source, index);
      continue;
    }

    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }

    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(source, index);
      continue;
    }

    if (/[A-Za-z_]/u.test(char)) {
      const identifierStart = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_-]/u.test(source[index]!)) {
        index += 1;
      }

      if (source.slice(identifierStart, index) !== "import") {
        continue;
      }

      index = skipWhitespaceAndComments(source, index);
      if (source[index] === "{") {
        return true;
      }
      continue;
    }

    index += 1;
  }

  return false;
}

function skipWhitespaceAndComments(source: string, startIndex: number): number {
  let index = startIndex;

  while (index < source.length) {
    const char = source[index]!;
    const nextChar = source[index + 1];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === "#" || (char === "/" && nextChar === "/")) {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && nextChar === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    break;
  }

  return index;
}

function skipQuotedString(source: string, startIndex: number): number {
  let index = startIndex + 1;

  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') {
      return index + 1;
    }
    index += 1;
  }

  return index;
}

function skipLineComment(source: string, startIndex: number): number {
  const newlineIndex = source.indexOf("\n", startIndex);
  return newlineIndex === -1 ? source.length : newlineIndex + 1;
}

function skipBlockComment(source: string, startIndex: number): number {
  const closeIndex = source.indexOf("*/", startIndex + 2);
  return closeIndex === -1 ? source.length : closeIndex + 2;
}

function assertSafeBaseTerraformFiles(files: readonly TerraformSyncFileInput[]): void {
  if (files.length === 0 || files.length > 99) {
    throw new Error("Terraform import bundle의 원본 파일 수가 올바르지 않습니다.");
  }

  const fileNames = new Set<string>();
  for (const file of files) {
    if (
      file.fileName === terraformImportsFileName ||
      !/^[A-Za-z0-9._-]+\.(?:tf|tftpl)$/u.test(file.fileName) ||
      fileNames.has(file.fileName)
    ) {
      throw new Error("imports.tf는 서버 전용이며 안전한 Terraform 파일 이름만 허용됩니다.");
    }
    fileNames.add(file.fileName);
  }

  if (!files.some((file) => file.fileName.endsWith(".tf"))) {
    throw new Error("Terraform import bundle에는 최소 하나의 .tf 파일이 필요합니다.");
  }
}
