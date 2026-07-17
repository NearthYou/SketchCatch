import type { AwsConnection } from "@sketchcatch/types";

const settingsHref = "/dashboard/settings?tab=aws&next=reverse" as const;

export type ReverseEngineeringAwsConnectionReadiness =
  | "ready"
  | "setup_required"
  | "verification_required"
  | "retry_required";

export type ReverseEngineeringAwsConnectionRecovery = {
  readonly readiness: ReverseEngineeringAwsConnectionReadiness;
  readonly canStartScan: boolean;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly settingsHref: typeof settingsHref;
  readonly selectedConnectionId: string | null;
};

export function canStartReverseEngineeringScan(input: {
  readonly createProjectOnApply: boolean;
  readonly hasSelectedVerifiedConnection: boolean;
  readonly hasSelectedProject: boolean;
  readonly loadState: "idle" | "loading" | "error";
  readonly recovery: ReverseEngineeringAwsConnectionRecovery;
  readonly scanState: "idle" | "loading" | "error";
  readonly selectedResourceTypeCount: number;
}): boolean {
  return (
    (input.createProjectOnApply || input.hasSelectedProject) &&
    input.hasSelectedVerifiedConnection &&
    input.recovery.canStartScan &&
    input.selectedResourceTypeCount > 0 &&
    input.loadState === "idle" &&
    input.scanState !== "loading"
  );
}

// 화면에서 선택을 보존하되, 사라진 연결만 검증된 연결 또는 최근 복구 대상으로 바꿉니다.
export function getReverseEngineeringAwsConnectionRecovery(input: {
  readonly connections: readonly AwsConnection[];
  readonly selectedConnectionId: string;
}): ReverseEngineeringAwsConnectionRecovery {
  const selectedConnection = resolveSelectedConnection(input);

  if (!selectedConnection) {
    return createRecovery({
      readiness: "setup_required",
      description: "기존 AWS를 읽으려면 먼저 AWS Role을 연결해야 합니다.",
      actionLabel: "AWS Role 연결하기",
      selectedConnectionId: null
    });
  }

  if (selectedConnection.status === "verified") {
    if (selectedConnection.accountId && selectedConnection.roleArn) {
      return createRecovery({
        readiness: "ready",
        description: "",
        actionLabel: "",
        selectedConnectionId: selectedConnection.id
      });
    }

    return createRecovery({
      readiness: "verification_required",
      description: "AWS 계정과 Role 연결 확인을 완료해야 기존 AWS를 읽을 수 있습니다.",
      actionLabel: "설정 계속",
      selectedConnectionId: selectedConnection.id
    });
  }

  if (selectedConnection.status === "pending") {
    return createRecovery({
      readiness: "verification_required",
      description: "AWS Role 연결 설정을 마친 뒤 확인을 완료해야 기존 AWS를 읽을 수 있습니다.",
      actionLabel: "설정 계속",
      selectedConnectionId: selectedConnection.id
    });
  }

  return createRecovery({
    readiness: "retry_required",
    description: "이 AWS Role 연결을 다시 확인한 뒤 기존 AWS를 읽을 수 있습니다.",
    actionLabel: "연결 다시 확인",
    selectedConnectionId: selectedConnection.id
  });
}

// 선택 목록에는 화면에 필요한 상태와 마스킹된 계정 정보만 표시합니다.
export function formatReverseEngineeringAwsConnectionLabel(connection: AwsConnection): string {
  const accountLabel = connection.accountId
    ? connection.accountId.replace(/\b(\d{4})\d{8}\b/g, "$1********")
    : "계정 미확인";
  const statusLabel = getAwsConnectionStatusLabel(connection.status);

  return `${accountLabel} · ${connection.region} · ${statusLabel}`;
}

function createRecovery(input: {
  readonly readiness: ReverseEngineeringAwsConnectionReadiness;
  readonly description: string;
  readonly actionLabel: string;
  readonly selectedConnectionId: string | null;
}): ReverseEngineeringAwsConnectionRecovery {
  return {
    readiness: input.readiness,
    canStartScan: input.readiness === "ready",
    title: "AWS Role이 아직 준비되지 않았습니다.",
    description: input.description,
    actionLabel: input.actionLabel,
    settingsHref,
    selectedConnectionId: input.selectedConnectionId
  };
}

function resolveSelectedConnection(input: {
  readonly connections: readonly AwsConnection[];
  readonly selectedConnectionId: string;
}): AwsConnection | null {
  const selectedConnection = input.connections.find(
    (connection) => connection.id === input.selectedConnectionId
  );
  if (selectedConnection) {
    return selectedConnection;
  }

  const verifiedConnection = input.connections.find(
    (connection) => connection.status === "verified"
  );
  if (verifiedConnection) {
    return verifiedConnection;
  }

  return [...input.connections].sort(compareConnectionsByRecency)[0] ?? null;
}

function compareConnectionsByRecency(left: AwsConnection, right: AwsConnection): number {
  const updatedAtDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  const createdAtDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

function getAwsConnectionStatusLabel(status: AwsConnection["status"]): string {
  if (status === "verified") {
    return "검증됨";
  }

  if (status === "pending") {
    return "확인 필요";
  }

  return "재확인 필요";
}
