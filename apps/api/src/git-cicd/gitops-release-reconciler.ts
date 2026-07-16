import type {
  GitOpsReleaseEvidence,
  GitCicdPipelineRunStatus
} from "@sketchcatch/types";
import {
  ApplicationArtifactBuildInProgressError,
  ApplicationArtifactProviderVerificationError
} from "../artifacts/application-artifact-registry.js";
import type {
  EcsGitOpsReleaseReconciler,
  EcsGitOpsReleaseRecord
} from "./ecs-gitops-release-reconciler.js";
import type { LambdaGitOpsReleaseReconciler } from "./lambda-gitops-release-reconciler.js";
import type { Ec2AsgGitOpsReleaseReconciler } from "./ec2-asg-gitops-release-reconciler.js";
import type { StaticSiteGitOpsReleaseReconciler } from "./static-site-gitops-release-reconciler.js";
import type { GitOpsApplicationArtifactRegistrar } from "./gitops-application-artifact-registrar.js";

export type GitOpsReleaseReconcileInput = {
  projectId: string;
  pipelineRunId: string;
  commitSha: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  evidence: GitOpsReleaseEvidence;
};

export type GitOpsReleaseReconciler = {
  reconcile(input: GitOpsReleaseReconcileInput): Promise<EcsGitOpsReleaseRecord | null>;
};

export function createGitOpsReleaseReconciler(options: {
  ecs: EcsGitOpsReleaseReconciler;
  lambda: LambdaGitOpsReleaseReconciler;
  ec2Asg: Ec2AsgGitOpsReleaseReconciler;
  staticSite: StaticSiteGitOpsReleaseReconciler;
  artifactRegistrar?: GitOpsApplicationArtifactRegistrar;
}): GitOpsReleaseReconciler {
  return {
    async reconcile(input) {
      let artifact = null;
      try {
        artifact = options.artifactRegistrar
          ? await options.artifactRegistrar.register({
              projectId: input.projectId,
              pipelineRunId: input.pipelineRunId,
              commitSha: input.commitSha,
              evidence: input.evidence
            })
          : null;
      } catch (error) {
        if (
          !(error instanceof ApplicationArtifactProviderVerificationError) &&
          !(error instanceof ApplicationArtifactBuildInProgressError)
        ) {
          throw error;
        }
      }
      const reconcilerInput = { ...input, artifactId: artifact?.id ?? null };
      if (input.evidence.runtimeTargetKind === "ecs_fargate") {
        return options.ecs.reconcile({ ...reconcilerInput, evidence: input.evidence });
      }
      if (input.evidence.runtimeTargetKind === "lambda") {
        return options.lambda.reconcile({ ...reconcilerInput, evidence: input.evidence });
      }
      if (input.evidence.runtimeTargetKind === "ec2_asg") {
        return options.ec2Asg.reconcile({ ...reconcilerInput, evidence: input.evidence });
      }
      return options.staticSite.reconcile({ ...reconcilerInput, evidence: input.evidence });
    }
  };
}
