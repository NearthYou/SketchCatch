import type { DatabaseClient } from "../db/client.js";
import { createAwsProjectBuildEnvironmentGateway } from "../build-environments/aws-project-build-environment-gateway.js";
import {
  ProjectBuildEnvironmentError,
  createPostgresProjectBuildEnvironmentRepository,
  prepareProjectBuildEnvironment as prepareProjectBuildEnvironmentService,
  verifyProjectRepositoryAccess as verifyProjectRepositoryAccessService
} from "../build-environments/project-build-environment-service.js";
import type { DeploymentRecord } from "./deployment-service.js";

type RepositoryAccessVerificationResult = {
  buildEnvironment: {
    repositoryVerificationStatus: "not_checked" | "verified" | "failed";
    repositoryVerificationStatusReason: string | null;
  } | null;
};

export type DeploymentPlanBuildEnvironmentOptions = {
  prepareProjectBuildEnvironment?: (input: {
    architectureId: string;
    db: DatabaseClient["db"];
    projectId: string;
    userId: string;
  }) => Promise<void>;
  verifyProjectRepositoryAccess?: (input: {
    db: DatabaseClient["db"];
    projectId: string;
    userId: string;
  }) => Promise<RepositoryAccessVerificationResult>;
};

export async function prepareEcsBuildEnvironmentForPlan(
  input: {
    db: DatabaseClient["db"];
    deployment: DeploymentRecord;
    userId: string;
  },
  options: DeploymentPlanBuildEnvironmentOptions = {}
): Promise<void> {
  if (
    input.deployment.scope === "infrastructure" ||
    input.deployment.targetKind !== "ecs_fargate"
  ) {
    return;
  }

  const prepareProjectBuildEnvironment =
    options.prepareProjectBuildEnvironment ??
    (async (preparation: {
      architectureId: string;
      db: DatabaseClient["db"];
      projectId: string;
      userId: string;
    }) => {
      await prepareProjectBuildEnvironmentService(
        {
          architectureId: preparation.architectureId,
          projectId: preparation.projectId,
          userId: preparation.userId
        },
        createPostgresProjectBuildEnvironmentRepository(preparation.db),
        createAwsProjectBuildEnvironmentGateway()
      );
    });
  await prepareProjectBuildEnvironment({
    architectureId: input.deployment.architectureId,
    db: input.db,
    projectId: input.deployment.projectId,
    userId: input.userId
  });

  const verifyProjectRepositoryAccess =
    options.verifyProjectRepositoryAccess ??
    (async (verification: { db: DatabaseClient["db"]; projectId: string; userId: string }) =>
      verifyProjectRepositoryAccessService(
        {
          projectId: verification.projectId,
          userId: verification.userId
        },
        createPostgresProjectBuildEnvironmentRepository(verification.db),
        createAwsProjectBuildEnvironmentGateway()
      ));
  const verification = await verifyProjectRepositoryAccess({
    db: input.db,
    projectId: input.deployment.projectId,
    userId: input.userId
  });
  if (verification.buildEnvironment?.repositoryVerificationStatus !== "verified") {
    throw new ProjectBuildEnvironmentError(
      "REPOSITORY_ACCESS_VERIFICATION_REQUIRED",
      verification.buildEnvironment?.repositoryVerificationStatusReason ??
        "Repository checkout verification must succeed before Terraform Plan"
    );
  }
}
