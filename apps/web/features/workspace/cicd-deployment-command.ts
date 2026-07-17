import type { GitCicdPipelineExecutionKind } from "@sketchcatch/types";

const DEFAULT_INFRASTRUCTURE_WORKFLOW_FILE = "sketchcatch-infra.yml";
const SAFE_WORKFLOW_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/u;
const SAFE_GIT_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;

export function createInfrastructureDeploymentCommand(
  branch = "main",
  workflowFile = DEFAULT_INFRASTRUCTURE_WORKFLOW_FILE
): string {
  if (!isSafeGitBranch(branch)) {
    throw new Error("안전한 Git branch 이름만 인프라 배포 명령에 사용할 수 있습니다.");
  }
  if (!SAFE_WORKFLOW_FILE_PATTERN.test(workflowFile)) {
    throw new Error("안전한 GitHub Workflow 파일명만 인프라 배포 명령에 사용할 수 있습니다.");
  }

  return `gh workflow run ${workflowFile} --ref ${branch}`;
}

export function formatPipelineExecutionKind(kind: GitCicdPipelineExecutionKind): string {
  return kind === "app" ? "코드 배포" : "인프라 배포";
}

function isSafeGitBranch(branch: string): boolean {
  return (
    SAFE_GIT_BRANCH_PATTERN.test(branch) &&
    !branch.startsWith("-") &&
    !branch.endsWith(".") &&
    !branch.endsWith("/") &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.includes("@{")
  );
}
