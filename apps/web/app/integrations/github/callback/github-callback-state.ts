import type {
  GitHubProjectConnectionTarget,
  GitHubRepositoryCandidate
} from "@sketchcatch/types";
import {
  inferEcsWebBuildConfig,
  type EcsFargateDeploymentDefaultsInput
} from "../../../projects/[projectId]/settings/project-deployment-target-state";
import type { RepositoryAnalysisResumeState } from "../../../workspace/repository/repository-analysis-resume";

export function canResumeRepositoryAnalysis(input: {
  readonly deploymentTargetSaved: boolean;
  readonly gitOpsMonitoringSaved: boolean;
}): boolean {
  return input.deploymentTargetSaved && input.gitOpsMonitoringSaved;
}

export async function saveCallbackSettings(input: {
  readonly saveDeploymentTarget: () => Promise<boolean>;
  readonly saveGitOpsMonitoring: () => Promise<boolean>;
}): Promise<boolean> {
  if (!await input.saveDeploymentTarget()) return false;
  return input.saveGitOpsMonitoring();
}

export function selectCallbackTarget(
  repositories: readonly GitHubRepositoryCandidate[],
  target: GitHubProjectConnectionTarget
): GitHubRepositoryCandidate | null {
  const owner = target.owner.trim().toLowerCase();
  const name = target.name.trim().toLowerCase();

  return repositories.find(
    (repository) =>
      repository.owner.toLowerCase() === owner &&
      repository.name.toLowerCase() === name
  ) ?? null;
}

export function createCallbackEcsDefaults(
  resume: RepositoryAnalysisResumeState
): EcsFargateDeploymentDefaultsInput {
  const dockerfileEvidence = resume.publicAnalysis.aiHandoff?.evidence.filter(
    (evidence) => evidence.kind === "dockerfile"
  ) ?? [];
  const dockerfile = dockerfileEvidence.length === 1 ? dockerfileEvidence[0] : null;
  const fallbackDockerfilePath = resume.publicAnalysis.evidenceFiles.find(
    (evidence) => evidence.found && /(?:^|\/)Dockerfile$/iu.test(evidence.path)
  )?.path;
  const dockerfilePath = dockerfile?.path ?? fallbackDockerfilePath ?? "Dockerfile";
  const applicationUnit = dockerfile
    ? resume.publicAnalysis.aiHandoff?.applicationUnits.find(
        (unit) => unit.id === dockerfile.applicationUnitId
      )
    : null;
  const pathSeparator = dockerfilePath.lastIndexOf("/");
  const sourceRoot = applicationUnit?.rootPath ||
    (pathSeparator === -1 ? "." : dockerfilePath.slice(0, pathSeparator));
  const ecsWeb = inferEcsWebBuildConfig(resume.publicAnalysis.aiHandoff);

  return {
    projectName: getRepositoryName(resume.repositoryUrl),
    repositoryRevision: resume.publicAnalysis.repositoryRevision,
    sourceRoot: ecsWeb?.api.sourceRoot ?? sourceRoot,
    dockerfilePath,
    ...(ecsWeb ? { ecsWeb } : {})
  };
}

function getRepositoryName(repositoryUrl: string): string {
  const pathname = new URL(repositoryUrl).pathname;
  const rawName = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const name = rawName.replace(/\.git$/iu, "").trim();

  if (!name) throw new Error("Repository 이름을 확인할 수 없습니다.");
  return name;
}
