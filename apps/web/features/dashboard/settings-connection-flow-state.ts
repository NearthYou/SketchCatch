import type { AwsCodeConnectionStatus } from "@sketchcatch/types";

export type SettingsConnectionFlowStepId = "github" | "aws" | "codebuild";
export type SettingsConnectionFlowStepState = "complete" | "current" | "error" | "locked";

export type SettingsConnectionFlowState = Readonly<{
  githubStepState: SettingsConnectionFlowStepState;
  awsStepState: SettingsConnectionFlowStepState;
  codeBuildStepState: SettingsConnectionFlowStepState;
  recommendedConnectionStep: SettingsConnectionFlowStepId | null;
}>;

/** gg: AWS 연결은 GitHub와 독립적으로 시작하고 CodeBuild 단계에서만 둘의 준비 상태를 함께 요구합니다. */
export function deriveSettingsConnectionFlowState(input: {
  readonly githubReady: boolean;
  readonly hasVerifiedAwsConnection: boolean;
  readonly codeBuildStatus: AwsCodeConnectionStatus | undefined;
}): SettingsConnectionFlowState {
  const githubStepState: SettingsConnectionFlowStepState = input.githubReady
    ? "complete"
    : "current";
  const awsStepState: SettingsConnectionFlowStepState = input.hasVerifiedAwsConnection
    ? "complete"
    : "current";
  const codeBuildStepState: SettingsConnectionFlowStepState =
    !input.githubReady || !input.hasVerifiedAwsConnection
      ? "locked"
      : input.codeBuildStatus === "AVAILABLE"
        ? "complete"
        : input.codeBuildStatus === "ERROR"
          ? "error"
          : "current";

  return {
    githubStepState,
    awsStepState,
    codeBuildStepState,
    recommendedConnectionStep: !input.hasVerifiedAwsConnection
      ? "aws"
      : !input.githubReady
        ? "github"
        : input.codeBuildStatus === "AVAILABLE"
          ? null
          : "codebuild"
  };
}
