import type {
  GitOpsReleaseEvidence,
  GitCicdPipelineRunStatus
} from "@sketchcatch/types";
import type {
  EcsGitOpsReleaseReconciler,
  EcsGitOpsReleaseRecord
} from "./ecs-gitops-release-reconciler.js";
import type { LambdaGitOpsReleaseReconciler } from "./lambda-gitops-release-reconciler.js";
import type { Ec2AsgGitOpsReleaseReconciler } from "./ec2-asg-gitops-release-reconciler.js";

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
}): GitOpsReleaseReconciler {
  return {
    reconcile(input) {
      if (input.evidence.runtimeTargetKind === "ecs_fargate") {
        return options.ecs.reconcile({ ...input, evidence: input.evidence });
      }
      if (input.evidence.runtimeTargetKind === "lambda") {
        return options.lambda.reconcile({ ...input, evidence: input.evidence });
      }
      return options.ec2Asg.reconcile({ ...input, evidence: input.evidence });
    }
  };
}
