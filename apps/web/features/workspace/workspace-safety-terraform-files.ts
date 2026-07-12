import type { TerraformVirtualFile } from "./terraform-panel-utils";

export type WorkspaceSafetyTerraformFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

// 편집 중인 Terraform 파일에서 빈 파일만 빼고 원래 파일명과 내용을 검사 API 형식으로 옮깁니다.
export function createWorkspaceSafetyTerraformFiles(
  terraformFiles: readonly TerraformVirtualFile[]
): WorkspaceSafetyTerraformFile[] {
  return terraformFiles
    .filter((file) => file.code.trim())
    .map((file) => ({
      fileName: file.fileName,
      terraformCode: file.code
    }));
}
