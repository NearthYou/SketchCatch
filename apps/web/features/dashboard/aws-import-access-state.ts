import type {
  AwsConnectionStatus,
  AwsImportAccessNextAction,
  AwsImportAccessState,
  AwsImportAccessStatus
} from "@sketchcatch/types";

export type AwsImportAccessUiCommand =
  | "prepare_manager"
  | "check_manager"
  | "preview_policy"
  | "apply_policy"
  | "check_reads"
  | "open_settings"
  | "prepare_cleanup"
  | "check_cleanup";

export type AwsImportAccessView = {
  readonly title: string;
  readonly description: string;
  readonly primaryAction: string | null;
  readonly primaryCommand: AwsImportAccessUiCommand | null;
  readonly secondaryAction: string | null;
  readonly secondaryCommand: AwsImportAccessUiCommand | null;
  readonly cleanupAction: string | null;
  readonly cleanupCommand: AwsImportAccessUiCommand | null;
  readonly deploymentConnectionPreserved: true;
  readonly isBusy: boolean;
  readonly canContinue: boolean;
};

const STATUS_PRESENTATION = {
  check_required: {
    title: "가져오기 권한 확인 필요",
    description: "AWS 구조를 가져오기 위한 읽기 권한을 확인해 주세요."
  },
  manager_approval_required: {
    title: "AWS에서 Manager 준비 필요",
    description: "AWS Console에서 가져오기 권한을 관리할 기반을 먼저 확인해 주세요."
  },
  manager_checking: {
    title: "Manager 준비 확인 중",
    description: "AWS에서 준비한 내용을 확인하고 있습니다."
  },
  policy_approval_required: {
    title: "가져오기 권한 승인 필요",
    description: "추가할 읽기 범위를 확인한 뒤 직접 적용해 주세요."
  },
  policy_working: {
    title: "가져오기 권한 적용 중",
    description: "AWS에서 읽기 권한을 준비하고 있습니다."
  },
  checking_reads: {
    title: "가져오기 준비 확인 중",
    description: "AWS 항목을 바꾸지 않는 읽기 요청으로 준비 상태를 확인합니다."
  },
  ready: {
    title: "가져오기 준비됨",
    description: "이 AWS 연결로 구조를 가져올 수 있습니다."
  },
  limited: {
    title: "가져오기 가능 · 일부 확장 정보 제한",
    description: "핵심 구조는 가져올 수 있고 일부 부가 정보만 제한됩니다."
  },
  update_required: {
    title: "가져오기 권한 업데이트 필요",
    description: "기존 연결은 유지하고 부족한 읽기 권한만 보완합니다."
  },
  retry_required: {
    title: "잠시 후 다시 확인해 주세요",
    description: "기존 연결은 유지됩니다. 서버가 안내한 단계부터 다시 진행해 주세요."
  },
  connection_required: {
    title: "AWS 연결 확인 필요",
    description: "가져오기 권한과 별개로 기존 AWS 연결을 먼저 확인해 주세요."
  },
  cleanup_policy_required: {
    title: "가져오기 권한 정리 필요",
    description: "가져오기 권한 Stack이 남아 있습니다. AWS에서 먼저 정리해 주세요."
  },
  cleanup_manager_required: {
    title: "Manager 정리 필요",
    description: "가져오기 권한 정리가 끝났습니다. 이제 Manager를 정리해 주세요."
  },
  cleanup_checking: {
    title: "AWS 권한 정리 확인 중",
    description: "SketchCatch가 추가한 항목이 모두 정리됐는지 확인하고 있습니다."
  },
  cleanup_required: {
    title: "AWS 권한 정리 확인 필요",
    description: "Stack이 없어도 남은 권한 항목이 있을 수 있어 상태를 다시 확인해야 합니다."
  },
  cleanup_complete: {
    title: "가져오기 권한 정리 완료",
    description: "SketchCatch가 추가한 가져오기 권한 정리가 끝났습니다."
  }
} satisfies Record<AwsImportAccessStatus, { readonly title: string; readonly description: string }>;

const BUSY_STATUSES = new Set<AwsImportAccessStatus>([
  "manager_checking",
  "policy_working",
  "checking_reads",
  "cleanup_checking"
]);

/** gg: 서버의 status와 nextAction을 한 표로 해석해 임의 문자열 추측을 막습니다. */
export function deriveAwsImportAccessView(input: {
  readonly connectionStatus: AwsConnectionStatus;
  readonly hasPolicyApproval?: boolean;
  readonly state: AwsImportAccessState;
}): AwsImportAccessView {
  const presentation = STATUS_PRESENTATION[input.state.status];
  const canStartCleanup = canStartAwsImportAccessCleanup(
    input.state.status,
    input.state.nextAction,
    input.state.cleanupAvailable
  );
  if (
    input.connectionStatus !== "verified" &&
    !isAwsImportAccessCleanupFlow(input.state.status, input.state.nextAction)
  ) {
    return {
      ...STATUS_PRESENTATION.connection_required,
      primaryAction: "AWS 연결 확인",
      primaryCommand: "open_settings",
      secondaryAction: null,
      secondaryCommand: null,
      cleanupAction: canStartCleanup ? "가져오기 권한 정리" : null,
      cleanupCommand: canStartCleanup ? "prepare_cleanup" : null,
      deploymentConnectionPreserved: true,
      isBusy: false,
      canContinue: false
    };
  }

  const hasPolicyApproval = input.hasPolicyApproval === true;
  const primaryCommand = resolvePrimaryCommand(input.state, hasPolicyApproval);
  const managerReload = input.state.status === "manager_approval_required" &&
    primaryCommand !== "prepare_manager";
  const cleanupCheck = input.state.status === "cleanup_policy_required" ||
    input.state.status === "cleanup_manager_required";
  return {
    ...presentation,
    primaryAction: getCommandLabel(primaryCommand, input.state.status),
    primaryCommand,
    secondaryAction: managerReload
      ? "AWS Console 다시 열기"
      : cleanupCheck
        ? "정리 상태 확인"
        : null,
    secondaryCommand: managerReload
      ? "prepare_manager"
      : cleanupCheck
        ? "check_cleanup"
        : null,
    cleanupAction: canStartCleanup ? "가져오기 권한 정리" : null,
    cleanupCommand: canStartCleanup ? "prepare_cleanup" : null,
    deploymentConnectionPreserved: true,
    isBusy: BUSY_STATUSES.has(input.state.status),
    canContinue: input.state.status === "ready" || input.state.status === "limited"
  };
}

/** gg: persisted setup만 정리를 시작하고 합성·cleanup 상태는 기존 흐름을 유지합니다. */
function canStartAwsImportAccessCleanup(
  status: AwsImportAccessStatus,
  nextAction: AwsImportAccessNextAction | null,
  cleanupAvailable: boolean
): boolean {
  if (!cleanupAvailable) {
    return false;
  }
  switch (status) {
    case "check_required":
    case "manager_approval_required":
    case "manager_checking":
    case "policy_approval_required":
    case "policy_working":
    case "checking_reads":
    case "ready":
    case "limited":
    case "update_required":
    case "connection_required":
      return true;
    case "retry_required":
      return nextAction !== "check_cleanup";
    case "cleanup_policy_required":
    case "cleanup_manager_required":
    case "cleanup_checking":
    case "cleanup_required":
    case "cleanup_complete":
      return false;
  }
}

/** gg: reload로 일회성 승인이 사라지면 apply 대신 새 preview부터 다시 시작합니다. */
function resolvePrimaryCommand(
  state: AwsImportAccessState,
  hasPolicyApproval: boolean
): AwsImportAccessUiCommand | null {
  if (state.status === "policy_approval_required") {
    return hasPolicyApproval ? "apply_policy" : "preview_policy";
  }
  return mapNextAction(state.nextAction);
}

/** gg: API nextAction을 실제 UI command로 빠짐없이 바꾸고 cleanup 순서를 보존합니다. */
function mapNextAction(nextAction: AwsImportAccessNextAction | null): AwsImportAccessUiCommand | null {
  switch (nextAction) {
    case null: return null;
    case "prepare_manager": return "prepare_manager";
    case "check_manager": return "check_manager";
    case "preview_policy": return "preview_policy";
    case "apply_policy": return "preview_policy";
    case "check_reads": return "check_reads";
    case "open_settings": return "open_settings";
    case "delete_policy_stack": return "prepare_cleanup";
    case "delete_manager_stack": return "prepare_cleanup";
    case "check_cleanup": return "check_cleanup";
    case "retry": return null;
  }
}

/** gg: 같은 command라도 최초 승인·업데이트·정리 단계에 맞는 쉬운 문구를 고릅니다. */
function getCommandLabel(
  command: AwsImportAccessUiCommand | null,
  status: AwsImportAccessStatus
): string | null {
  switch (command) {
    case null: return null;
    case "prepare_manager": return status === "retry_required"
      ? "AWS Console 다시 열기"
      : "AWS에서 준비";
    case "check_manager": return "Manager 준비 확인";
    case "preview_policy": return status === "policy_approval_required"
      ? "권한 변경 내용 확인"
      : "가져오기 권한 업데이트";
    case "apply_policy": return "확인한 권한 적용";
    case "check_reads": return "읽기 권한 다시 확인";
    case "open_settings": return "AWS 연결 확인";
    case "prepare_cleanup": return status === "cleanup_manager_required"
      ? "AWS에서 Manager 정리"
      : "AWS에서 가져오기 권한 정리";
    case "check_cleanup": return "정리 상태 확인";
  }
}

/** gg: 연결이 비활성이어도 cleanup 상태와 operation-aware cleanup retry는 계속 보여줍니다. */
function isAwsImportAccessCleanupFlow(
  status: AwsImportAccessStatus,
  nextAction: AwsImportAccessNextAction | null
): boolean {
  if (status === "retry_required") {
    return nextAction === "check_cleanup";
  }
  return status === "cleanup_policy_required" ||
    status === "cleanup_manager_required" ||
    status === "cleanup_checking" ||
    status === "cleanup_required" ||
    status === "cleanup_complete";
}
