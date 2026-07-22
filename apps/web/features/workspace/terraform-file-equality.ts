import type { TerraformSyncFileInput } from "../../../../packages/types/src";

type NormalizedTerraformFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

export function areTerraformSyncFilesEqual(
  first: readonly TerraformSyncFileInput[],
  second: readonly TerraformSyncFileInput[]
): boolean {
  if (first === second) {
    return true;
  }

  if (first.length !== second.length) {
    return false;
  }

  const normalizedFirst = normalizeTerraformFiles(first);
  const normalizedSecond = normalizeTerraformFiles(second);

  return normalizedFirst.every(
    (file, index) =>
      file.fileName === normalizedSecond[index]?.fileName &&
      file.terraformCode === normalizedSecond[index]?.terraformCode
  );
}

function normalizeTerraformFiles(
  files: readonly TerraformSyncFileInput[]
): NormalizedTerraformFile[] {
  return files
    .map((file) => ({
      fileName: normalizeTerraformFilePath(file.fileName),
      terraformCode: file.terraformCode.replace(/\r\n?/g, "\n")
    }))
    .sort((left, right) => {
      const pathOrder = left.fileName.localeCompare(right.fileName);
      return pathOrder !== 0 ? pathOrder : left.terraformCode.localeCompare(right.terraformCode);
    });
}

function normalizeTerraformFilePath(fileName: string): string {
  const normalized = fileName.trim().replaceAll("\\", "/").replace(/^(\.\/)+/, "");
  return normalized || "main.tf";
}
