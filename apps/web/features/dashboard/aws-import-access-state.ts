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
    title: "AWS 구조 분석 권한 확인 필요",
    description: "기존 AWS 구조 분석에 필요한 권한을 확인해 주세요."
  },
  manager_approval_required: {
    title: "AWS에서 권한 설정 필요",
    description: "기존 AWS 구조 분석에 필요한 권한을 AWS Console에서 설정해 주세요."
  },
  manager_checking: {
    title: "권한 상태 확인 중",
    description: "AWS에서 설정한 구조 분석 권한을 확인하고 있습니다."
  },
  policy_approval_required: {
    title: "AWS 구조 분석 권한 설정 필요",
    description: "추가할 권한을 확인한 뒤 AWS에서 설정해 주세요."
  },
  policy_working: {
    title: "AWS 구조 분석 권한 설정 중",
    description: "AWS에서 기존 AWS 구조 분석에 필요한 권한을 설정하고 있습니다."
  },
  checking_reads: {
    title: "권한 상태 확인 중",
    description: "기존 AWS 구조를 분석할 수 있는지 확인하고 있습니다."
  },
  ready: {
    title: "AWS 구조 분석 준비됨",
    description: "이 AWS 연결로 기존 AWS 구조를 분석할 수 있습니다."
  },
  limited: {
    title: "AWS 구조 분석 가능 · 일부 정보 제한",
    description: "핵심 구조는 분석할 수 있고 일부 부가 정보만 제한됩니다."
  },
  update_required: {
    title: "AWS 구조 분석 권한 설정 필요",
    description: "기존 연결은 유지하고 구조 분석에 필요한 권한만 보완합니다."
  },
  retry_required: {
    title: "잠시 후 다시 확인해 주세요",
    description: "기존 AWS 연결은 유지됩니다. 안내한 단계부터 다시 진행해 주세요."
  },
  connection_required: {
    title: "AWS 연결 확인 필요",
    description: "기존 AWS 구조 분석 권한과 별개로 AWS 연결을 먼저 확인해 주세요."
  },
  cleanup_policy_required: {
    title: "AWS 구조 분석 권한 해제 필요",
    description: "기존 AWS 구조 분석에 사용한 권한이 남아 있습니다. AWS에서 먼저 해제해 주세요."
  },
  cleanup_manager_required: {
    title: "AWS 구조 분석 권한 해제 필요",
    description: "구조 분석 권한을 해제할 준비가 끝났습니다. AWS에서 남은 권한을 해제해 주세요."
  },
  cleanup_checking: {
    title: "권한 상태 확인 중",
    description: "SketchCatch가 구조 분석을 위해 추가한 권한이 모두 해제됐는지 확인하고 있습니다."
  },
  cleanup_required: {
    title: "AWS 구조 분석 권한 확인 필요",
    description: "이전에 사용한 구조 분석 권한 상태를 확인해 주세요."
  },
  cleanup_complete: {
    title: "AWS 구조 분석 권한 해제 완료",
    description: "SketchCatch가 구조 분석을 위해 추가한 권한을 모두 해제했습니다."
  }
} satisfies Record<AwsImportAccessStatus, { readonly title: string; readonly description: string }>;

const REPREPARE_PRESENTATION = {
  title: "AWS 구조 분석 권한 설정 필요",
  description: "기존 AWS 구조를 분석할 수 있도록 AWS에서 권한을 설정해 주세요."
} as const;

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
  const presentation = canReprepareAwsImportAccess(input.state)
    ? REPREPARE_PRESENTATION
    : STATUS_PRESENTATION[input.state.status];
  const isBusy = BUSY_STATUSES.has(input.state.status);

  /** gg: 권한 설정이나 확인이 진행 중이면 이전 행동을 함께 보여 주어 중복 실행을 막습니다. */
  if (isBusy) {
    return {
      ...presentation,
      primaryAction: null,
      primaryCommand: null,
      secondaryAction: null,
      secondaryCommand: null,
      cleanupAction: null,
      cleanupCommand: null,
      deploymentConnectionPreserved: true,
      isBusy: true,
      canContinue: false
    };
  }

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
      cleanupAction: canStartCleanup ? "구조 분석 권한 해제" : null,
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
    primaryAction: getCommandLabel(primaryCommand, input.state),
    primaryCommand,
    secondaryAction: managerReload
      ? "AWS에서 권한 설정"
      : cleanupCheck
        ? "권한 상태 확인"
        : null,
    secondaryCommand: managerReload
      ? "prepare_manager"
      : cleanupCheck
        ? "check_cleanup"
        : null,
    cleanupAction: canStartCleanup ? "구조 분석 권한 해제" : null,
    cleanupCommand: canStartCleanup ? "prepare_cleanup" : null,
    deploymentConnectionPreserved: true,
    isBusy: false,
    canContinue: input.state.status === "ready" || input.state.status === "limited"
  };
}

/** gg: 서버가 명시적으로 허용한 cleanup 확인 상태만 다시 준비로 되돌려 기존 정리 순서를 추측하지 않습니다. */
function canReprepareAwsImportAccess(state: AwsImportAccessState): boolean {
  return state.status === "cleanup_required" && state.nextAction === "prepare_manager";
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
  if (state.status === "cleanup_complete") {
    return null;
  }
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

/** gg: 내부 command 이름 대신 AWS 구조 분석에 필요한 다음 행동만 보여줍니다. */
function getCommandLabel(
  command: AwsImportAccessUiCommand | null,
  state: AwsImportAccessState
): string | null {
  switch (command) {
    case null: return null;
    case "prepare_manager": return "AWS에서 권한 설정";
    case "check_manager": return "권한 상태 확인";
    case "preview_policy": return state.status === "policy_approval_required"
      ? "권한 설정 내용 확인"
      : "AWS에서 권한 설정";
    case "apply_policy": return "AWS에서 권한 설정";
    case "check_reads": return "권한 상태 확인";
    case "open_settings": return "AWS 연결 확인";
    case "prepare_cleanup": return "구조 분석 권한 해제";
    case "check_cleanup": return "권한 상태 확인";
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
