import type {
  GitOpsReleaseEvidence,
  GitCicdPipelineRunStatus
} from "@sketchcatch/types";
import type {
  EcsGitOpsReleaseReconciler,
  EcsGitOpsReleaseRecord
} from "./ecs-gitops-release-reconciler.js";
import type { LambdaGitOpsReleaseReconciler } from "./lambda-gitops-release-reconciler.js";

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
}): GitOpsReleaseReconciler {
  return {
    reconcile(input) {
      if (input.evidence.runtimeTargetKind === "ecs_fargate") {
        return options.ecs.reconcile({ ...input, evidence: input.evidence });
      }
      return options.lambda.reconcile({ ...input, evidence: input.evidence });
    }
  };
}
