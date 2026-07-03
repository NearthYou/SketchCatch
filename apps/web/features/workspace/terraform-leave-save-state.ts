export type TerraformLeaveSaveState = "idle" | "saving" | "blocked";

export type TerraformLeaveSaveFeedback = {
  readonly canRunPendingAction: boolean;
  readonly message: string;
  readonly shouldRevealTerraformPanel: boolean;
  readonly shouldKeepDialogOpen: boolean;
  readonly state: TerraformLeaveSaveState;
};

export type TerraformLeaveSaveCompletionOptions = {
  readonly hasBlockingDiagnostics?: boolean;
};

export function createTerraformLeaveSaveStartFeedback(): TerraformLeaveSaveFeedback {
  return {
    canRunPendingAction: false,
    message: "",
    shouldRevealTerraformPanel: false,
    shouldKeepDialogOpen: true,
    state: "saving"
  };
}

export function resolveTerraformLeaveSaveCompletion(
  saved: boolean,
  options: TerraformLeaveSaveCompletionOptions = {}
): TerraformLeaveSaveFeedback {
  if (saved) {
    return {
      canRunPendingAction: true,
      message: "",
      shouldRevealTerraformPanel: false,
      shouldKeepDialogOpen: false,
      state: "idle"
    };
  }

  if (options.hasBlockingDiagnostics) {
    return {
      canRunPendingAction: false,
      message: "",
      shouldRevealTerraformPanel: true,
      shouldKeepDialogOpen: false,
      state: "idle"
    };
  }

  return {
    canRunPendingAction: false,
    message: "저장하지 못했습니다. Terraform 패널의 오류를 확인해 주세요.",
    shouldRevealTerraformPanel: false,
    shouldKeepDialogOpen: true,
    state: "blocked"
  };
}
