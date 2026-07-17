import type { CleanupAwsConnectionManagedResources } from "./aws-connection-service.js";
import {
  AwsCodeConnectionError,
  type AwsCodeConnectionRepository
} from "./aws-codeconnection-service.js";

export async function disconnectAwsCodeConnection(
  input: {
    connectionId: string;
    userId: string;
    confirmedManagedCleanup: boolean;
  },
  repository: AwsCodeConnectionRepository,
  options: {
    cleanupManagedResources?: CleanupAwsConnectionManagedResources;
    now?: () => Date;
  } = {}
): Promise<void> {
  if (!input.confirmedManagedCleanup) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED",
      "GitHub 빌드 연결 해제에 동의해 주세요.",
      400
    );
  }
  if (!options.cleanupManagedResources) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_FAILED",
      "GitHub 빌드 연결 정리 기능을 사용할 수 없습니다.",
      503
    );
  }

  const connection = await repository.findVerifiedConnection(input.connectionId, input.userId);
  if (!connection) {
    throw new AwsCodeConnectionError(
      "AWS_CONNECTION_REQUIRED",
      "GitHub 빌드 연결을 관리하려면 검증된 AWS 연결이 필요합니다."
    );
  }
  const existing = await repository.findByAwsConnectionId(connection.id);
  if (!existing) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_NOT_FOUND",
      "GitHub 빌드 연결을 찾을 수 없습니다.",
      404
    );
  }
  if (existing.status === "CREATING" || existing.status === "DELETING") {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_BLOCKED",
      "현재 GitHub 빌드 연결 작업이나 앱 빌드·배포가 진행 중입니다. 완료 후 다시 시도해 주세요."
    );
  }

  const now = options.now?.() ?? new Date();
  const claim = await repository.claimDeletion({
    id: existing.id,
    connectionId: connection.id,
    now
  });
  if (claim !== "claimed") {
    throw new AwsCodeConnectionError(
      claim === "not_found" ? "CODECONNECTION_NOT_FOUND" : "CODECONNECTION_DELETE_BLOCKED",
      claim === "not_found"
        ? "GitHub 빌드 연결을 찾을 수 없습니다."
        : "GitHub 빌드 연결 작업이나 앱 빌드·배포가 진행 중입니다."
    );
  }

  try {
    const resources = await repository.findManagedResources(connection.id);
    await options.cleanupManagedResources({ connection, resources });
    if (
      !(await repository.completeDeletion({
        id: existing.id,
        connectionId: connection.id
      }))
    ) {
      throw new Error("GitHub build connection metadata changed during cleanup");
    }
  } catch {
    await repository.markDeletionFailed({
      id: existing.id,
      reason: "AWS의 SketchCatch 관리 리소스 정리에 실패했습니다. 다시 시도해 주세요.",
      now
    });
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_FAILED",
      "GitHub 빌드 연결을 안전하게 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502
    );
  }
}
