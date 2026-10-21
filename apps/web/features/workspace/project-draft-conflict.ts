import type { TerraformSyncFileInput } from "../../../../packages/types/src";

export const PROJECT_DRAFT_CONFLICT_COPY = {
  title: "다른 탭에서 이 프로젝트가 변경되었습니다",
  description: "현재 탭의 변경은 아직 서버에 저장되지 않았습니다.",
  reloadWarning:
    "최신 상태를 불러오면 현재 화면의 Architecture Board와 Terraform files가 서버 상태로 교체됩니다.",
  keepEditingAction: "현재 편집 유지",
  reloadAction: "최신 상태 불러오기",
  reloadingAction: "불러오는 중"
} as const;

export type BoardAutoOrganizeTerraformReconciliation = {
  readonly hasUnsavedChanges: boolean;
  readonly terraformFiles: TerraformSyncFileInput[];
};

/** 서버 요청 중 생긴 Terraform 편집은 서버 응답으로 덮지 않고 로컬 변경으로 남깁니다. */
export function reconcileBoardAutoOrganizeTerraformFiles({
  currentFiles,
  savedFiles
}: {
  readonly currentFiles: readonly TerraformSyncFileInput[];
  readonly savedFiles: readonly TerraformSyncFileInput[];
}): BoardAutoOrganizeTerraformReconciliation {
  return {
    hasUnsavedChanges: !areTerraformFilesExactlyEqual(currentFiles, savedFiles),
    terraformFiles: currentFiles.map((file) => ({ ...file }))
  };
}

/** visual-only 적용에서는 파일 순서와 원문까지 같아야 서버 저장 상태로 봅니다. */
function areTerraformFilesExactlyEqual(
  first: readonly TerraformSyncFileInput[],
  second: readonly TerraformSyncFileInput[]
): boolean {
  return (
    first.length === second.length &&
    first.every(
      (file, index) =>
        file.fileName === second[index]?.fileName &&
        file.terraformCode === second[index]?.terraformCode
    )
  );
}
