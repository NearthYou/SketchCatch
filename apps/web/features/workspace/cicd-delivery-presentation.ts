export type DeploymentTargetPresentation = {
  readonly status: "saved" | "recommended" | "dirty" | "required";
  readonly statusLabel: string;
  readonly readinessHint: string | null;
  readonly saveLabel: string;
};

export function getDeploymentTargetPresentation(input: {
  readonly draftAwsConnectionId: string | null;
  readonly savedAwsConnectionId: string | null;
  readonly isDirty: boolean;
}): DeploymentTargetPresentation {
  if (input.isDirty) {
    return {
      status: "dirty",
      statusLabel: "미저장 변경",
      readinessHint: "변경 내용을 저장해야 배포 준비 상태에 반영됩니다.",
      saveLabel: "변경 저장"
    };
  }
  if (
    input.savedAwsConnectionId &&
    input.savedAwsConnectionId === input.draftAwsConnectionId
  ) {
    return {
      status: "saved",
      statusLabel: "저장됨",
      readinessHint: null,
      saveLabel: "저장됨"
    };
  }
  if (input.draftAwsConnectionId) {
    return {
      status: "recommended",
      statusLabel: "저장 전 추천값",
      readinessHint: "추천 AWS 연결이 선택되어 있지만 아직 저장되지 않았습니다.",
      saveLabel: "추천값 저장"
    };
  }
  return {
    status: "required",
    statusLabel: "설정 필요",
    readinessHint: "PR을 만들려면 AWS 연결을 선택하고 저장해야 합니다.",
    saveLabel: "AWS 연결 저장"
  };
}
