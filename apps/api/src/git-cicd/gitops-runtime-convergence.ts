import type {
  GitOpsReleaseEvidence,
  ProjectDeploymentRuntimeConfig,
  RuntimeAdapterKind,
  RuntimeConvergenceOutcome,
  RuntimeDeploymentTarget
} from "@sketchcatch/types";
import {
  DeploymentTargetFingerprintMismatchError,
  resolveAwsDeploymentTargetIdentity
} from "../runtime-convergence/deployment-target-identity.js";

export type VerifiedGitOpsRuntimeConvergence = {
  readonly runtimeAdapterKind: RuntimeAdapterKind | null;
  readonly deploymentTargetFingerprint: string | null;
  readonly convergenceOutcome: RuntimeConvergenceOutcome | null;
};

export class GitOpsRuntimeConvergenceVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitOpsRuntimeConvergenceVerificationError";
  }
}

export function resolveGitOpsDeploymentTargetFingerprint(input: {
  readonly projectId: string;
  readonly accountId: string;
  readonly region: string;
  readonly runtimeTarget?: RuntimeDeploymentTarget | null | undefined;
  readonly runtimeConfig: ProjectDeploymentRuntimeConfig;
  readonly healthCheckPath?: string | null | undefined;
  readonly persistedDeploymentTargetFingerprint?: string | null | undefined;
}): string {
  try {
    return resolveAwsDeploymentTargetIdentity(input).deploymentTargetFingerprint;
  } catch (error) {
    if (error instanceof DeploymentTargetFingerprintMismatchError) {
      throw new GitOpsRuntimeConvergenceVerificationError(
        "Persisted deployment target fingerprint does not match its runtime configuration"
      );
    }
    throw error;
  }
}

export function verifyGitOpsRuntimeConvergence(input: {
  readonly evidence: GitOpsReleaseEvidence;
  readonly expectedAdapterKind: RuntimeAdapterKind;
  readonly expectedDeploymentTargetFingerprint: string | null | undefined;
}): VerifiedGitOpsRuntimeConvergence {
  if (input.evidence.schemaVersion !== 3) {
    return {
      runtimeAdapterKind: null,
      deploymentTargetFingerprint: null,
      convergenceOutcome: null
    };
  }

  const expectedFingerprint = input.expectedDeploymentTargetFingerprint;
  const convergence = input.evidence.convergence;
  const evidenceDigest = readArtifactDigest(input.evidence);
  const releaseSucceeded = input.evidence.outcome === "succeeded";
  if (
    !expectedFingerprint ||
    convergence.adapterKind !== input.expectedAdapterKind ||
    convergence.deploymentTargetFingerprint !== expectedFingerprint ||
    convergence.artifactFingerprint !== input.evidence.artifact.artifactFingerprint ||
    convergence.artifactDigest !== evidenceDigest ||
    convergence.artifactDigestAlgorithm !== "sha256" ||
    (!releaseSucceeded && convergence.outcome !== "rolled_out")
  ) {
    throw new GitOpsRuntimeConvergenceVerificationError(
      "GitOps convergence evidence does not match the confirmed runtime target and artifact"
    );
  }

  return {
    runtimeAdapterKind: convergence.adapterKind,
    deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
    convergenceOutcome: releaseSucceeded ? convergence.outcome : null
  };
}

function readArtifactDigest(evidence: GitOpsReleaseEvidence): string {
  return (evidence.runtimeTargetKind === "ecs_fargate"
    ? evidence.imageDigest
    : evidence.artifactDigest).replace(/^sha256:/u, "");
}
