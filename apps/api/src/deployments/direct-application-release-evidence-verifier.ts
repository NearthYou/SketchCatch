import type {
  Ec2AsgGitOpsReleaseEvidence,
  EcsGitOpsReleaseEvidence,
  GitCicdPipelineRunStatus,
  GitOpsReleaseEvidence,
  LambdaGitOpsReleaseEvidence,
  StaticSiteGitOpsReleaseEvidence
} from "@sketchcatch/types";
import {
  createAwsEc2AsgGitOpsCloudGateway,
  createEc2AsgGitOpsReleaseReconciler,
  type Ec2AsgGitOpsCloudGateway
} from "../git-cicd/ec2-asg-gitops-release-reconciler.js";
import {
  createAwsEcsGitOpsCloudGateway,
  createEcsGitOpsReleaseReconciler,
  type EcsGitOpsCloudGateway
} from "../git-cicd/ecs-gitops-release-reconciler.js";
import {
  createAwsLambdaGitOpsCloudGateway,
  createLambdaGitOpsReleaseReconciler,
  type LambdaGitOpsCloudGateway
} from "../git-cicd/lambda-gitops-release-reconciler.js";
import {
  createAwsStaticSiteGitOpsCloudGateway,
  createStaticSiteGitOpsReleaseReconciler,
  type StaticSiteGitOpsCloudGateway
} from "../git-cicd/static-site-gitops-release-reconciler.js";
import type {
  VerifiedDirectRuntimeRelease,
  VerifyDirectReleaseEvidence
} from "./aws-codebuild-direct-application-release-gateway.js";
import {
  DirectApplicationReleaseError,
  type DirectApplicationArtifact,
  type DirectApplicationReleaseContext
} from "./direct-application-release-service.js";

const syntheticPipelineRunId = "00000000-0000-4000-8000-000000000001";

export function createDirectApplicationReleaseEvidenceVerifier(options: {
  ecsGateway?: EcsGitOpsCloudGateway;
  lambdaGateway?: LambdaGitOpsCloudGateway;
  ec2AsgGateway?: Ec2AsgGitOpsCloudGateway;
  staticSiteGateway?: StaticSiteGitOpsCloudGateway;
} = {}): VerifyDirectReleaseEvidence {
  return async ({ context, artifact, evidence }) => {
    assertEvidenceMatchesPreparedArtifact(artifact, evidence);
    if (evidence.runtimeTargetKind === "ecs_fargate") {
      return verifyEcs(context, evidence, options.ecsGateway ?? createAwsEcsGitOpsCloudGateway());
    }
    if (evidence.runtimeTargetKind === "lambda") {
      return verifyLambda(
        context,
        evidence,
        options.lambdaGateway ?? createAwsLambdaGitOpsCloudGateway()
      );
    }
    if (evidence.runtimeTargetKind === "ec2_asg") {
      return verifyEc2Asg(
        context,
        evidence,
        options.ec2AsgGateway ?? createAwsEc2AsgGitOpsCloudGateway()
      );
    }
    return verifyStaticSite(
      context,
      evidence,
      options.staticSiteGateway ?? createAwsStaticSiteGitOpsCloudGateway()
    );
  };
}

async function verifyEcs(
  context: DirectApplicationReleaseContext,
  evidence: EcsGitOpsReleaseEvidence,
  gateway: EcsGitOpsCloudGateway
): Promise<VerifiedDirectRuntimeRelease> {
  if (
    context.target.runtimeTargetKind !== "ecs_fargate" ||
    context.target.runtimeConfig.runtimeTargetKind !== "ecs_fargate"
  ) throw runtimeMismatch();
  const runtimeConfig = context.target.runtimeConfig;
  const reconciler = createEcsGitOpsReleaseReconciler({
    gateway,
    repository: {
      async findVerificationTarget() {
        return {
          projectId: context.deployment.projectId,
          connection: context.connection,
          runtimeConfig
        };
      },
      async upsertRelease(input) {
        return input;
      }
    }
  });
  const record = await reconciler.reconcile(createReconcileInput(context, evidence));
  return toVerifiedRelease(record, {
    previousTaskDefinitionArn: evidence.previousTaskDefinitionArn
  });
}

async function verifyLambda(
  context: DirectApplicationReleaseContext,
  evidence: LambdaGitOpsReleaseEvidence,
  gateway: LambdaGitOpsCloudGateway
): Promise<VerifiedDirectRuntimeRelease> {
  if (
    context.target.runtimeTargetKind !== "lambda" ||
    context.target.runtimeConfig.runtimeTargetKind !== "lambda"
  ) throw runtimeMismatch();
  const runtimeConfig = context.target.runtimeConfig;
  const reconciler = createLambdaGitOpsReleaseReconciler({
    gateway,
    repository: {
      async findVerificationTarget() {
        return {
          projectId: context.deployment.projectId,
          connection: context.connection,
          runtimeConfig
        };
      },
      async upsertRelease(input) {
        return input;
      }
    }
  });
  const record = await reconciler.reconcile(createReconcileInput(context, evidence));
  return toVerifiedRelease(record, {
    previousVersion: evidence.previousVersion
  });
}

async function verifyEc2Asg(
  context: DirectApplicationReleaseContext,
  evidence: Ec2AsgGitOpsReleaseEvidence,
  gateway: Ec2AsgGitOpsCloudGateway
): Promise<VerifiedDirectRuntimeRelease> {
  if (
    context.target.runtimeTargetKind !== "ec2_asg" ||
    context.target.runtimeConfig.runtimeTargetKind !== "ec2_asg"
  ) throw runtimeMismatch();
  const runtimeConfig = context.target.runtimeConfig;
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    gateway,
    repository: {
      async findVerificationTarget() {
        return {
          projectId: context.deployment.projectId,
          connection: context.connection,
          runtimeConfig
        };
      },
      async upsertRelease(input) {
        return input;
      }
    }
  });
  const record = await reconciler.reconcile(createReconcileInput(context, evidence));
  return toVerifiedRelease(record, {
    previousArtifactUri: evidence.previousArtifactUri,
    previousArtifactVersionId: evidence.previousArtifactVersionId
  });
}

async function verifyStaticSite(
  context: DirectApplicationReleaseContext,
  evidence: StaticSiteGitOpsReleaseEvidence,
  gateway: StaticSiteGitOpsCloudGateway
): Promise<VerifiedDirectRuntimeRelease> {
  if (
    context.target.runtimeTargetKind !== "static_site" ||
    context.target.runtimeConfig.runtimeTargetKind !== "static_site"
  ) throw runtimeMismatch();
  const runtimeConfig = context.target.runtimeConfig;
  const reconciler = createStaticSiteGitOpsReleaseReconciler({
    gateway,
    repository: {
      async findVerificationTarget() {
        return {
          projectId: context.deployment.projectId,
          connection: context.connection,
          runtimeConfig
        };
      },
      async upsertRelease(input) {
        return input;
      }
    }
  });
  const record = await reconciler.reconcile(createReconcileInput(context, evidence));
  return toVerifiedRelease(record, {
    previousReleasePrefix: evidence.previousReleasePrefix,
    releasePrefix: evidence.releasePrefix,
    manifestVersionId: evidence.manifestVersionId
  });
}

function createReconcileInput<T extends GitOpsReleaseEvidence>(
  context: DirectApplicationReleaseContext,
  evidence: T
): {
  projectId: string;
  pipelineRunId: string;
  commitSha: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  evidence: T;
} {
  return {
    projectId: context.deployment.projectId,
    pipelineRunId: syntheticPipelineRunId,
    commitSha: evidence.commitSha,
    pipelineStatus: evidence.outcome === "succeeded" ? "succeeded" : "failed",
    startedAt: null,
    finishedAt: new Date(),
    evidence
  };
}

function assertEvidenceMatchesPreparedArtifact(
  artifact: DirectApplicationArtifact,
  evidence: GitOpsReleaseEvidence
): void {
  const digest = evidence.runtimeTargetKind === "ecs_fargate"
    ? evidence.imageDigest
    : evidence.artifactDigest;
  const reference = evidence.runtimeTargetKind === "ecs_fargate"
    ? evidence.imageUri
    : evidence.runtimeTargetKind === "static_site"
      ? evidence.manifestUri
      : evidence.artifactUri;
  if (
    evidence.commitSha.toLowerCase() !== artifact.commitSha.toLowerCase() ||
    digest !== `sha256:${artifact.digest}` ||
    reference !== artifact.reference
  ) {
    throw new DirectApplicationReleaseError(
      "Runtime release evidence does not match the prepared artifact"
    );
  }
}

function toVerifiedRelease(record: {
  providerRevision: VerifiedDirectRuntimeRelease["providerRevision"] | null;
  outputUrl: string | null;
  healthEvidence: VerifiedDirectRuntimeRelease["healthEvidence"] | null;
  rollbackEvidence: VerifiedDirectRuntimeRelease["rollbackEvidence"];
  status: string;
} | null, rollbackBaseline: Record<string, string>): VerifiedDirectRuntimeRelease {
  if (!record?.providerRevision || !record.outputUrl || !record.healthEvidence) {
    throw new DirectApplicationReleaseError("AWS runtime verification did not return release evidence");
  }
  const healthEvidence =
    record.status === "rolled_back" &&
    typeof record.healthEvidence === "object" &&
    !Array.isArray(record.healthEvidence)
      ? { ...record.healthEvidence, state: "restored" }
      : record.healthEvidence;
  return {
    providerRevision: {
      ...record.providerRevision,
      metadata: {
        ...record.providerRevision.metadata,
        ...rollbackBaseline
      }
    },
    outputUrl: record.outputUrl,
    healthEvidence,
    rollbackEvidence: record.rollbackEvidence,
    status: record.status === "rolled_back" ? "rolled_back" : "succeeded"
  };
}

function runtimeMismatch(): DirectApplicationReleaseError {
  return new DirectApplicationReleaseError(
    "Release evidence runtime does not match the confirmed project target"
  );
}
