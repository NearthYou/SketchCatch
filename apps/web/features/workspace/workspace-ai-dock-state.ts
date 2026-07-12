export type WorkspaceAiDockPhase =
  | "approval"
  | "completed"
  | "disabled"
  | "empty"
  | "error"
  | "generating"
  | "offline"
  | "preview"
  | "ready"
  | "sending";

export type WorkspaceAiDockStatus = {
  readonly description: string;
  readonly label: string;
  readonly tone: "danger" | "muted" | "neutral" | "success" | "warning";
};

const STATUS_BY_PHASE = {
  approval: {
    description: "검토한 뒤 적용하거나 취소하세요.",
    label: "적용 대기",
    tone: "warning"
  },
  completed: {
    description: "최근 요청 처리가 끝났습니다.",
    label: "응답 완료",
    tone: "success"
  },
  disabled: {
    description: "프로젝트를 연 뒤 AI를 사용할 수 있습니다.",
    label: "프로젝트가 필요함",
    tone: "muted"
  },
  empty: {
    description: "Architecture Board에 필요한 작업을 요청하세요.",
    label: "대화 시작 전",
    tone: "neutral"
  },
  error: {
    description: "오류 내용을 확인하고 다시 시도하세요.",
    label: "요청 실패",
    tone: "danger"
  },
  generating: {
    description: "현재 Board와 Terraform 문맥을 분석하고 있습니다.",
    label: "제안 만드는 중",
    tone: "neutral"
  },
  offline: {
    description: "네트워크 연결을 확인한 뒤 다시 시도하세요.",
    label: "연결 확인 필요",
    tone: "warning"
  },
  preview: {
    description: "아직 실제 상태에는 적용되지 않았습니다.",
    label: "제안 생성됨",
    tone: "warning"
  },
  ready: {
    description: "새 요청을 입력할 수 있습니다.",
    label: "입력 가능",
    tone: "neutral"
  },
  sending: {
    description: "AI 서비스로 요청을 전달하고 있습니다.",
    label: "요청 보내는 중",
    tone: "neutral"
  }
} as const satisfies Record<WorkspaceAiDockPhase, WorkspaceAiDockStatus>;

// 열기와 닫기 전환에서만 focus가 이동하도록 대상을 결정합니다.
export function getWorkspaceAiDockFocusTarget(
  wasOpen: boolean,
  isOpen: boolean
): "composer" | "launcher" | null {
  if (!wasOpen && isOpen) return "composer";
  if (wasOpen && !isOpen) return "launcher";
  return null;
}

// AI와 project 상태를 색에 의존하지 않는 한 가지 화면 단계로 합칩니다.
export function resolveWorkspaceAiDockPhase({
  errorMessage,
  hasApproval,
  hasProjectContext,
  isOnline,
  lastMessageState,
  messageCount,
  requestState
}: {
  readonly errorMessage: string;
  readonly hasApproval: boolean;
  readonly hasProjectContext: boolean;
  readonly isOnline: boolean;
  readonly lastMessageState: "completed" | "error" | "preview" | "question" | null;
  readonly messageCount: number;
  readonly requestState: "generating" | "idle" | "sending";
}): WorkspaceAiDockPhase {
  if (!hasProjectContext) return "disabled";
  if (!isOnline) return "offline";
  if (errorMessage || lastMessageState === "error") return "error";
  if (requestState === "sending") return "sending";
  if (requestState === "generating") return "generating";
  if (hasApproval) return "approval";
  if (lastMessageState === "preview") return "preview";
  if (lastMessageState === "completed") return "completed";
  if (messageCount === 0) return "empty";
  return "ready";
}

// 화면 단계에 맞는 label과 짧은 설명을 함께 돌려줍니다.
export function getWorkspaceAiDockStatus(phase: WorkspaceAiDockPhase): WorkspaceAiDockStatus {
  return STATUS_BY_PHASE[phase];
}

// 사용자가 보지 못한 완료 응답에만 런처의 작은 상태점을 표시합니다.
export function getWorkspaceAiDockUnread({
  isOpen,
  responseCompleted
}: {
  readonly isOpen: boolean;
  readonly responseCompleted: boolean;
}): boolean {
  return responseCompleted && !isOpen;
}
