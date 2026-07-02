export type TerraformLeaveSaveState = "idle" | "saving" | "blocked";

export type TerraformLeaveSaveFeedback = {
  readonly canRunPendingAction: boolean;
  readonly message: string;
  readonly shouldKeepDialogOpen: boolean;
  readonly state: TerraformLeaveSaveState;
};

export function createTerraformLeaveSaveStartFeedback(): TerraformLeaveSaveFeedback {
  return {
    canRunPendingAction: false,
    message: "Terraform 변경사항을 저장하는 중입니다.",
    shouldKeepDialogOpen: true,
    state: "saving"
  };
}

export function resolveTerraformLeaveSaveCompletion(saved: boolean): TerraformLeaveSaveFeedback {
  if (saved) {
    return {
      canRunPendingAction: true,
      message: "",
      shouldKeepDialogOpen: false,
      state: "idle"
    };
  }

  return {
    canRunPendingAction: false,
    message: "저장하지 못했습니다. Terraform 패널의 오류를 확인해 주세요.",
    shouldKeepDialogOpen: true,
    state: "blocked"
  };
}
