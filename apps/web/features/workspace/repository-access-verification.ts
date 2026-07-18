import type { ProjectBuildEnvironment } from "@sketchcatch/types";
import { ApiClientError } from "../../lib/api-client";

export type RepositoryAccessVerificationOperations = {
  readonly currentBuildEnvironment: ProjectBuildEnvironment | null;
  readonly onBuildEnvironmentChange: (environment: ProjectBuildEnvironment) => void;
  readonly prepare: () => Promise<ProjectBuildEnvironment>;
  readonly verify: () => Promise<ProjectBuildEnvironment>;
};

export async function verifyRepositoryAccessForPlan(
  operations: RepositoryAccessVerificationOperations
): Promise<ProjectBuildEnvironment> {
  let preparedBuildEnvironment =
    operations.currentBuildEnvironment?.status === "ready"
      ? operations.currentBuildEnvironment
      : await operations.prepare();
  operations.onBuildEnvironmentChange(preparedBuildEnvironment);
  assertBuildEnvironmentReady(preparedBuildEnvironment);

  try {
    return await verifyRepositoryAccess(operations);
  } catch (error) {
    if (!isRepositoryAccessReprepareRequired(error)) {
      throw error;
    }
  }

  preparedBuildEnvironment = await operations.prepare();
  operations.onBuildEnvironmentChange(preparedBuildEnvironment);
  assertBuildEnvironmentReady(preparedBuildEnvironment);

  return verifyRepositoryAccess(operations);
}

async function verifyRepositoryAccess(
  operations: RepositoryAccessVerificationOperations
): Promise<ProjectBuildEnvironment> {
  const repositoryVerifiedBuildEnvironment = await operations.verify();
  operations.onBuildEnvironmentChange(repositoryVerifiedBuildEnvironment);

  if (repositoryVerifiedBuildEnvironment.repositoryVerificationStatus !== "verified") {
    throw new Error(
      repositoryVerifiedBuildEnvironment.repositoryVerificationStatusReason ??
        "CodeBuild가 프로젝트 GitHub repository의 확정 commit을 checkout하지 못했습니다."
    );
  }

  return repositoryVerifiedBuildEnvironment;
}

function assertBuildEnvironmentReady(environment: ProjectBuildEnvironment): void {
  if (environment.status === "ready") return;

  throw new Error(
    "빌드 환경 검증을 완료하지 못했습니다. AWS CodeBuild용 GitHub 권한과 AWS 연결을 확인해 주세요."
  );
}

function isRepositoryAccessReprepareRequired(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 409 &&
    error.code === "REPOSITORY_ACCESS_VERIFICATION_REQUIRED"
  );
}
