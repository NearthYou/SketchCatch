import type {
  AwsConnection,
  BuildEvidenceKind,
  BuildExecutionPreset,
  ProjectDeploymentTarget,
  PutProjectDeploymentTargetRequest,
  RuntimeTargetKind,
  SourceRepository
} from "@sketchcatch/types";

export type ProjectDeploymentTargetDraft = {
  connectionId: string;
  runtimeTargetKind: RuntimeTargetKind;
  sourceRoot: string;
  evidencePath: string;
  commitSha: string;
  version: string;
  healthCheckPath: string;
  codeBuildProjectName: string;
  ecrRepositoryName: string;
  clusterName: string;
  serviceName: string;
  containerName: string;
  outputUrl: string;
  evidenceSuggested: boolean;
};

const runtimeBuildConfig: Record<
  RuntimeTargetKind,
  { buildPreset: BuildExecutionPreset; evidenceKind: BuildEvidenceKind; defaultPath: string }
> = {
  ecs_fargate: {
    buildPreset: "docker_build",
    evidenceKind: "dockerfile",
    defaultPath: "Dockerfile"
  },
  lambda: {
    buildPreset: "sam_build",
    evidenceKind: "sam_template",
    defaultPath: "template.yaml"
  },
  ec2_asg: {
    buildPreset: "codedeploy_bundle",
    evidenceKind: "appspec",
    defaultPath: "appspec.yml"
  },
  static_site: {
    buildPreset: "static_export",
    evidenceKind: "static_output",
    defaultPath: "dist"
  }
};

export function createDeploymentTargetDraft(
  target: ProjectDeploymentTarget | null,
  connections: readonly AwsConnection[],
  sourceRepository?: SourceRepository | null
): ProjectDeploymentTargetDraft {
  const runtimeTargetKind = target?.runtimeTargetKind ?? "ecs_fargate";
  const config = target?.confirmedBuildConfig;
  const ecsConfig = target?.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
    ? target.runtimeConfig
    : null;
  const suggestion = target ? null : getDockerEvidenceSuggestion(sourceRepository);
  return {
    connectionId:
      target?.connectionId ?? connections.find((item) => item.status === "verified")?.id ?? "",
    runtimeTargetKind,
    sourceRoot: config?.sourceRoot ?? suggestion?.sourceRoot ?? ".",
    evidencePath:
      config?.evidence[0]?.path ??
      suggestion?.evidencePath ??
      getDefaultDeploymentEvidencePath(runtimeTargetKind),
    commitSha: config?.confirmedCommitSha ?? suggestion?.commitSha ?? "",
    version: config?.exactSemVerTag ?? config?.manifestVersion ?? "",
    healthCheckPath: config?.healthCheckPath ?? "/health",
    codeBuildProjectName: ecsConfig?.codeBuildProjectName ?? "",
    ecrRepositoryName: ecsConfig?.ecrRepositoryName ?? "",
    clusterName: ecsConfig?.clusterName ?? "",
    serviceName: ecsConfig?.serviceName ?? "",
    containerName: ecsConfig?.containerName ?? "",
    outputUrl: ecsConfig?.outputUrl ?? "",
    evidenceSuggested: Boolean(suggestion)
  };
}

export function getDefaultDeploymentEvidencePath(runtimeTargetKind: RuntimeTargetKind): string {
  return runtimeBuildConfig[runtimeTargetKind].defaultPath;
}

export function formatDeploymentTargetUpdatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

export function isDeploymentTargetDraftReady(
  draft: ProjectDeploymentTargetDraft,
  connections: readonly AwsConnection[]
): boolean {
  return (
    connections.some(
      (connection) => connection.id === draft.connectionId && connection.status === "verified"
    ) &&
    /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(draft.commitSha) &&
    draft.sourceRoot.trim().length > 0 &&
    draft.evidencePath.trim().length > 0 &&
    (draft.runtimeTargetKind !== "ecs_fargate" ||
      (/^\//.test(draft.healthCheckPath) && hasCompleteEcsCoordinates(draft)))
  );
}

export function createDeploymentTargetRequest(
  draft: ProjectDeploymentTargetDraft,
  connections: readonly AwsConnection[],
  confirmedAt: Date = new Date()
): PutProjectDeploymentTargetRequest {
  const connection = connections.find(
    (item) => item.id === draft.connectionId && item.status === "verified"
  );
  if (!connection || !isDeploymentTargetDraftReady(draft, connections)) {
    throw new Error("Verified connection and confirmed build evidence are required.");
  }

  const runtime = runtimeBuildConfig[draft.runtimeTargetKind];
  const evidencePath = draft.evidencePath.trim();
  const version = draft.version.trim() || null;

  return {
    provider: "aws",
    connectionId: connection.id,
    region: connection.region,
    runtimeTargetKind: draft.runtimeTargetKind,
    rolloutStrategy: "all_at_once",
    runtimeConfig:
      draft.runtimeTargetKind === "ecs_fargate"
        ? {
            runtimeTargetKind: "ecs_fargate",
            codeBuildProjectName: draft.codeBuildProjectName.trim(),
            ecrRepositoryName: draft.ecrRepositoryName.trim(),
            clusterName: draft.clusterName.trim(),
            serviceName: draft.serviceName.trim(),
            containerName: draft.containerName.trim(),
            outputUrl: draft.outputUrl.trim()
          }
        : null,
    confirmedBuildConfig: {
      sourceRoot: draft.sourceRoot.trim(),
      evidence: [{ kind: runtime.evidenceKind, path: evidencePath }],
      installPreset: "none",
      buildPreset: runtime.buildPreset,
      artifactOutputPath: draft.runtimeTargetKind === "static_site" ? evidencePath : null,
      runtimeEntrypoint: null,
      healthCheckPath:
        draft.runtimeTargetKind === "ecs_fargate" ? draft.healthCheckPath.trim() : null,
      dockerfilePath: draft.runtimeTargetKind === "ecs_fargate" ? evidencePath : null,
      packageManifestPath: null,
      samTemplatePath: draft.runtimeTargetKind === "lambda" ? evidencePath : null,
      appSpecPath: draft.runtimeTargetKind === "ec2_asg" ? evidencePath : null,
      staticOutputPath: draft.runtimeTargetKind === "static_site" ? evidencePath : null,
      exactSemVerTag: version?.startsWith("v") ? version : null,
      manifestVersion: version?.startsWith("v") ? null : version,
      confirmedCommitSha: draft.commitSha.toLowerCase(),
      confirmedAt: confirmedAt.toISOString()
    }
  };
}

function getDockerEvidenceSuggestion(sourceRepository?: SourceRepository | null): {
  sourceRoot: string;
  evidencePath: string;
  commitSha: string;
} | null {
  if (
    !sourceRepository ||
    sourceRepository.status !== "active" ||
    sourceRepository.archived ||
    !sourceRepository.analysis ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(sourceRepository.analysis.repositoryRevision)
  ) {
    return null;
  }
  const handoff = sourceRepository.analysis.aiHandoff;
  if (
    !handoff ||
    !Array.isArray(handoff.evidence) ||
    !Array.isArray(handoff.applicationUnits)
  ) return null;
  const dockerfiles = handoff.evidence.filter((item) => item.kind === "dockerfile");
  if (dockerfiles.length !== 1) return null;

  const evidence = dockerfiles[0];
  if (!evidence) return null;
  const applicationUnit = handoff.applicationUnits.find(
    (unit) => unit.id === evidence.applicationUnitId
  );
  const separator = evidence.path.lastIndexOf("/");
  return {
    sourceRoot:
      applicationUnit?.rootPath ?? (separator === -1 ? "." : evidence.path.slice(0, separator)),
    evidencePath: evidence.path,
    commitSha: sourceRepository.analysis.repositoryRevision.toLowerCase()
  };
}

function hasCompleteEcsCoordinates(draft: ProjectDeploymentTargetDraft): boolean {
  const values = [
    draft.codeBuildProjectName,
    draft.ecrRepositoryName,
    draft.clusterName,
    draft.serviceName,
    draft.containerName
  ];
  if (values.some((value) => value.trim().length === 0)) return false;
  try {
    const url = new URL(draft.outputUrl.trim());
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
