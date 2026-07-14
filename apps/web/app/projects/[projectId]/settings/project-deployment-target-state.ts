import type {
  AwsConnection,
  BuildEvidenceKind,
  BuildExecutionPreset,
  BuildInstallPreset,
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
  installPreset: BuildInstallPreset;
  healthCheckPath: string;
  codeBuildProjectName: string;
  ecrRepositoryName: string;
  clusterName: string;
  serviceName: string;
  containerName: string;
  functionLogicalId: string;
  functionName: string;
  aliasName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  autoScalingGroupName: string;
  hostingBucketName: string;
  cloudFrontDistributionId: string;
  cloudFrontOriginId: string;
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
  const lambdaConfig = target?.runtimeConfig?.runtimeTargetKind === "lambda"
    ? target.runtimeConfig
    : null;
  const ec2AsgConfig = target?.runtimeConfig?.runtimeTargetKind === "ec2_asg"
    ? target.runtimeConfig
    : null;
  const staticConfig = target?.runtimeConfig?.runtimeTargetKind === "static_site"
    ? target.runtimeConfig
    : null;
  const suggestion = target ? null : getEvidenceSuggestion(runtimeTargetKind, sourceRepository);
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
    installPreset: config?.installPreset ?? suggestion?.installPreset ?? "none",
    healthCheckPath: config?.healthCheckPath ?? "/health",
    codeBuildProjectName: target?.runtimeConfig?.codeBuildProjectName ?? "",
    ecrRepositoryName: ecsConfig?.ecrRepositoryName ?? "",
    clusterName: ecsConfig?.clusterName ?? "",
    serviceName: ecsConfig?.serviceName ?? "",
    containerName: ecsConfig?.containerName ?? "",
    functionLogicalId: lambdaConfig?.functionLogicalId ?? "",
    functionName: lambdaConfig?.functionName ?? "",
    aliasName: lambdaConfig?.aliasName ?? "",
    codeDeployApplicationName:
      lambdaConfig?.codeDeployApplicationName ?? ec2AsgConfig?.codeDeployApplicationName ?? "",
    codeDeployDeploymentGroupName:
      lambdaConfig?.codeDeployDeploymentGroupName ??
      ec2AsgConfig?.codeDeployDeploymentGroupName ??
      "",
    autoScalingGroupName: ec2AsgConfig?.autoScalingGroupName ?? "",
    hostingBucketName: staticConfig?.hostingBucketName ?? "",
    cloudFrontDistributionId: staticConfig?.cloudFrontDistributionId ?? "",
    cloudFrontOriginId: staticConfig?.cloudFrontOriginId ?? "",
    outputUrl:
      ecsConfig?.outputUrl ??
      lambdaConfig?.outputUrl ??
      ec2AsgConfig?.outputUrl ??
      staticConfig?.outputUrl ??
      "",
    evidenceSuggested: Boolean(suggestion)
  };
}

export function changeDeploymentTargetRuntime(
  draft: ProjectDeploymentTargetDraft,
  runtimeTargetKind: RuntimeTargetKind,
  sourceRepository?: SourceRepository | null
): ProjectDeploymentTargetDraft {
  const suggestion = getEvidenceSuggestion(runtimeTargetKind, sourceRepository);
  return {
    ...draft,
    runtimeTargetKind,
    sourceRoot: suggestion?.sourceRoot ?? ".",
    evidencePath: suggestion?.evidencePath ?? getDefaultDeploymentEvidencePath(runtimeTargetKind),
    commitSha: suggestion?.commitSha ?? "",
    installPreset: suggestion?.installPreset ?? "none",
    healthCheckPath:
      runtimeTargetKind === "ecs_fargate" ||
      runtimeTargetKind === "lambda" ||
      runtimeTargetKind === "ec2_asg"
        ? draft.healthCheckPath || "/health"
        : "",
    outputUrl: "",
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
      (/^\//.test(draft.healthCheckPath) && hasCompleteEcsCoordinates(draft))) &&
    (draft.runtimeTargetKind !== "lambda" ||
      (/^\//.test(draft.healthCheckPath) && hasCompleteLambdaCoordinates(draft))) &&
    (draft.runtimeTargetKind !== "ec2_asg" ||
      (/^\//.test(draft.healthCheckPath) && hasCompleteEc2AsgCoordinates(draft))) &&
    (draft.runtimeTargetKind !== "static_site" ||
      (draft.installPreset !== "none" && hasCompleteStaticSiteCoordinates(draft)))
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
        : draft.runtimeTargetKind === "lambda"
          ? {
              runtimeTargetKind: "lambda",
              codeBuildProjectName: draft.codeBuildProjectName.trim(),
              functionLogicalId: draft.functionLogicalId.trim(),
              functionName: draft.functionName.trim(),
              aliasName: draft.aliasName.trim(),
              codeDeployApplicationName: draft.codeDeployApplicationName.trim(),
              codeDeployDeploymentGroupName: draft.codeDeployDeploymentGroupName.trim(),
              outputUrl: draft.outputUrl.trim()
            }
          : draft.runtimeTargetKind === "ec2_asg"
            ? {
                runtimeTargetKind: "ec2_asg",
                codeBuildProjectName: draft.codeBuildProjectName.trim(),
                codeDeployApplicationName: draft.codeDeployApplicationName.trim(),
                codeDeployDeploymentGroupName: draft.codeDeployDeploymentGroupName.trim(),
                autoScalingGroupName: draft.autoScalingGroupName.trim(),
                outputUrl: draft.outputUrl.trim()
              }
            : {
                runtimeTargetKind: "static_site",
                codeBuildProjectName: draft.codeBuildProjectName.trim(),
                hostingBucketName: draft.hostingBucketName.trim(),
                cloudFrontDistributionId: draft.cloudFrontDistributionId.trim(),
                cloudFrontOriginId: draft.cloudFrontOriginId.trim(),
                outputUrl: draft.outputUrl.trim()
              },
    confirmedBuildConfig: {
      sourceRoot: draft.sourceRoot.trim(),
      evidence: [{ kind: runtime.evidenceKind, path: evidencePath }],
      installPreset: draft.runtimeTargetKind === "static_site" ? draft.installPreset : "none",
      buildPreset: runtime.buildPreset,
      artifactOutputPath: draft.runtimeTargetKind === "static_site" ? evidencePath : null,
      runtimeEntrypoint: null,
      healthCheckPath:
        draft.runtimeTargetKind === "ecs_fargate" ||
        draft.runtimeTargetKind === "lambda" ||
        draft.runtimeTargetKind === "ec2_asg"
          ? draft.healthCheckPath.trim()
          : null,
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

function getEvidenceSuggestion(
  runtimeTargetKind: RuntimeTargetKind,
  sourceRepository?: SourceRepository | null
): {
  sourceRoot: string;
  evidencePath: string;
  commitSha: string;
  installPreset: BuildInstallPreset;
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
  const evidenceKind = runtimeBuildConfig[runtimeTargetKind].evidenceKind;
  const matchingEvidence = handoff.evidence.filter((item) =>
    runtimeTargetKind === "lambda"
      ? item.kind === "framework_config" && /(?:^|\/)template\.ya?ml$/i.test(item.path)
      : runtimeTargetKind === "ec2_asg"
        ? item.kind === "framework_config" && /(?:^|\/)appspec\.ya?ml$/i.test(item.path)
        : item.kind === evidenceKind
  );
  if (matchingEvidence.length !== 1) return null;

  const evidence = matchingEvidence[0];
  if (!evidence) return null;
  const applicationUnit = handoff.applicationUnits.find(
    (unit) => unit.id === evidence.applicationUnitId
  );
  const separator = evidence.path.lastIndexOf("/");
  const sourceRoot =
    applicationUnit?.rootPath ?? (separator === -1 ? "." : evidence.path.slice(0, separator));
  return {
    sourceRoot,
    evidencePath: evidence.path,
    commitSha: sourceRepository.analysis.repositoryRevision.toLowerCase(),
    installPreset:
      runtimeTargetKind === "static_site"
        ? inferInstallPreset(handoff.evidence, sourceRoot)
        : "none"
  };
}

function inferInstallPreset(
  evidence: readonly { kind: string; path: string }[],
  sourceRoot: string
): BuildInstallPreset {
  const lockfiles = evidence
    .filter((item) => item.kind === "lockfile")
    .map((item) => item.path.toLowerCase());
  const normalizedRoot =
    sourceRoot.replace(/^\.\//, "").replace(/\/$/, "").toLowerCase() || ".";
  const scopedLockfiles = normalizedRoot === "."
    ? lockfiles.filter((path) => !path.includes("/"))
    : lockfiles.filter((path) => path.startsWith(`${normalizedRoot}/`) &&
        !path.slice(normalizedRoot.length + 1).includes("/"));
  const candidates = scopedLockfiles.length > 0
    ? scopedLockfiles
    : lockfiles.filter((path) => !path.includes("/"));
  const presets = new Set<BuildInstallPreset>();
  if (candidates.some((path) => path.endsWith("pnpm-lock.yaml"))) {
    presets.add("pnpm_frozen_lockfile");
  }
  if (candidates.some((path) => path.endsWith("package-lock.json"))) presets.add("npm_ci");
  if (candidates.some((path) => path.endsWith("yarn.lock"))) {
    presets.add("yarn_frozen_lockfile");
  }
  return presets.size === 1 ? [...presets][0]! : "none";
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
  return hasSafeHttpsOutputUrl(draft.outputUrl);
}

function hasCompleteLambdaCoordinates(draft: ProjectDeploymentTargetDraft): boolean {
  const values = [
    draft.codeBuildProjectName,
    draft.functionLogicalId,
    draft.functionName,
    draft.aliasName,
    draft.codeDeployApplicationName,
    draft.codeDeployDeploymentGroupName
  ];
  return values.every((value) => value.trim().length > 0) && hasSafeHttpsOutputUrl(draft.outputUrl);
}

function hasCompleteEc2AsgCoordinates(draft: ProjectDeploymentTargetDraft): boolean {
  const values = [
    draft.codeBuildProjectName,
    draft.codeDeployApplicationName,
    draft.codeDeployDeploymentGroupName,
    draft.autoScalingGroupName
  ];
  return values.every((value) => value.trim().length > 0) && hasSafeHttpsOutputUrl(draft.outputUrl);
}

function hasCompleteStaticSiteCoordinates(draft: ProjectDeploymentTargetDraft): boolean {
  const values = [
    draft.codeBuildProjectName,
    draft.hostingBucketName,
    draft.cloudFrontDistributionId,
    draft.cloudFrontOriginId
  ];
  return values.every((value) => value.trim().length > 0) && hasSafeHttpsOutputUrl(draft.outputUrl);
}

function hasSafeHttpsOutputUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
