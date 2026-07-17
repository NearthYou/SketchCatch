import { createHash, timingSafeEqual } from "node:crypto";
import type { AwsCodeConnectionDisconnectPreviewResponse } from "@sketchcatch/types";
import type {
  AwsConnectionManagedResources,
  CleanupAwsConnectionManagedResources
} from "./aws-connection-service.js";
import {
  AwsCodeConnectionError,
  type AwsCodeConnectionRepository,
  type VerifiedAwsConnectionForCodeConnection
} from "./aws-codeconnection-service.js";

export type DisconnectAwsCodeConnectionOptions = {
  cleanupManagedResources?: CleanupAwsConnectionManagedResources;
  now?: () => Date;
};

export async function getAwsCodeConnectionDisconnectPreview(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository
): Promise<AwsCodeConnectionDisconnectPreviewResponse> {
  const connection = await requireVerifiedConnection(input, repository);
  const existing = await repository.findByAwsConnectionId(connection.id);
  if (!existing) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_NOT_FOUND",
      "GitHub 빌드 연결을 찾을 수 없습니다.",
      404
    );
  }
  const [resources, activeBuildWork] = await Promise.all([
    repository.findManagedResources(connection.id),
    repository.hasActiveBuildWork(connection.id)
  ]);
  const blockerMessage = activeBuildWork
    ? "현재 앱 빌드 또는 배포가 진행 중입니다. 완료하거나 취소한 뒤 연결을 해제해 주세요."
    : existing.status === "CREATING"
      ? "GitHub 빌드 연결 생성이 진행 중입니다. 잠시 후 상태를 확인해 주세요."
      : existing.status === "DELETING"
        ? "GitHub 빌드 연결 해제가 이미 진행 중입니다."
        : null;

  return {
    connectionId: connection.id,
    canDisconnect: blockerMessage === null,
    blockerMessage,
    managedResources: {
      codeBuildProjects: resources.codeBuildProjects.map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        serviceRoleName: getRoleName(project.serviceRoleArn),
        logGroupName: `/aws/codebuild/${project.projectName}`
      })),
      buildCacheRepositories: resources.codeBuildProjects.length,
      codeConnection: resources.codeConnectionArn !== null
    },
    preservedResources: ["AWS 계정 연결", "배포된 애플리케이션 및 인프라"],
    confirmationToken: createDisconnectConfirmationToken(connection.id, resources)
  };
}

export async function disconnectAwsCodeConnection(
  input: {
    connectionId: string;
    userId: string;
    confirmedManagedCleanup: boolean;
    confirmationToken: string;
  },
  repository: AwsCodeConnectionRepository,
  options: DisconnectAwsCodeConnectionOptions = {}
): Promise<void> {
  if (!input.confirmedManagedCleanup) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED",
      "정리할 GitHub 빌드 리소스를 확인한 뒤 연결 해제에 동의해 주세요.",
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

  const preview = await getAwsCodeConnectionDisconnectPreview(input, repository);
  if (!preview.canDisconnect) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_BLOCKED",
      preview.blockerMessage ?? "GitHub 빌드 연결을 해제할 수 없습니다."
    );
  }
  if (!matchesDisconnectConfirmationToken(input.confirmationToken, preview.confirmationToken)) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED",
      "정리 대상이 변경되었습니다. 연결 해제 미리보기를 다시 확인해 주세요.",
      400
    );
  }

  const connection = await requireVerifiedConnection(input, repository);
  const existing = await repository.findByAwsConnectionId(connection.id);
  if (!existing) {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_NOT_FOUND",
      "GitHub 빌드 연결을 찾을 수 없습니다.",
      404
    );
  }
  const now = options.now?.() ?? new Date();
  const claim = await repository.claimDeletion({
    id: existing.id,
    connectionId: connection.id,
    now
  });
  if (claim === "not_found") {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_NOT_FOUND",
      "GitHub 빌드 연결을 찾을 수 없습니다.",
      404
    );
  }
  if (claim === "blocked") {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_BLOCKED",
      "현재 앱 빌드 또는 배포가 진행 중이거나 AWS 연결 삭제가 시작되었습니다. 완료 후 다시 시도해 주세요."
    );
  }
  if (claim === "busy") {
    throw new AwsCodeConnectionError(
      "CODECONNECTION_DELETE_BLOCKED",
      "GitHub 빌드 연결 생성 또는 해제가 이미 진행 중입니다."
    );
  }

  try {
    const currentResources = await repository.findManagedResources(connection.id);
    const currentToken = createDisconnectConfirmationToken(connection.id, currentResources);
    if (!matchesDisconnectConfirmationToken(input.confirmationToken, currentToken)) {
      await repository.markDeletionFailed({
        id: existing.id,
        reason: "연결 해제 대상이 변경되었습니다. 미리보기를 다시 확인해 주세요.",
        now
      });
      throw new AwsCodeConnectionError(
        "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED",
        "정리 대상이 변경되었습니다. 연결 해제 미리보기를 다시 확인해 주세요.",
        400
      );
    }
    await options.cleanupManagedResources({ connection, resources: currentResources });
    const completed = await repository.completeDeletion({
      id: existing.id,
      connectionId: connection.id
    });
    if (!completed) {
      throw new Error("GitHub build connection metadata changed during cleanup");
    }
  } catch (error) {
    if (
      error instanceof AwsCodeConnectionError &&
      error.code === "CODECONNECTION_DELETE_CONFIRMATION_REQUIRED"
    ) {
      throw error;
    }
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

async function requireVerifiedConnection(
  input: { connectionId: string; userId: string },
  repository: AwsCodeConnectionRepository
): Promise<VerifiedAwsConnectionForCodeConnection> {
  const connection = await repository.findVerifiedConnection(input.connectionId, input.userId);
  if (!connection) {
    throw new AwsCodeConnectionError(
      "AWS_CONNECTION_REQUIRED",
      "GitHub 빌드 연결을 관리하려면 검증된 AWS 연결이 필요합니다."
    );
  }
  return connection;
}

function createDisconnectConfirmationToken(
  connectionId: string,
  resources: AwsConnectionManagedResources
): string {
  const canonical = {
    connectionId,
    codeBuildProjects: resources.codeBuildProjects
      .map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        serviceRoleArn: project.serviceRoleArn
      }))
      .sort((left, right) =>
        `${left.projectId}:${left.projectName}:${left.serviceRoleArn}`.localeCompare(
          `${right.projectId}:${right.projectName}:${right.serviceRoleArn}`
        )
      ),
    codeConnectionArn: resources.codeConnectionArn
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function matchesDisconnectConfirmationToken(candidate: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(candidate) || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"));
}

function getRoleName(roleArn: string): string {
  const roleName = roleArn.split("/").at(-1);
  return roleName && roleName.length > 0 ? roleName : "확인 불가";
}
