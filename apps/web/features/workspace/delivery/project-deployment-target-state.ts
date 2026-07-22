import type {
  AwsConnection,
  BuildEvidenceKind,
  BuildExecutionPreset,
  BuildInstallPreset,
  DiagramJson,
  EcsWebBuildConfig,
  PackageManagerKind,
  ProjectDeploymentTarget,
  PutProjectDeploymentTargetRequest,
  RepositoryAnalysisAiHandoff,
  RepositoryAnalysisRecord,
  RuntimeTargetKind,
  SourceRepository
} from "@sketchcatch/types";
import { createEcsFargateRuntimeNames } from "@sketchcatch/types";

import {
  createEditableEcsWebBuildConfig,
  getEcsWebBuildConfigIssueKeys,
  getEcsWebPackageManagerDefaultsForLockfile
} from "./ecs-web-build-config-state";

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
  ecsWeb: EcsWebBuildConfig | null;
  ecsRequiredRuntimeSecrets: readonly string[];
  evidenceSuggested: boolean;
};

export type EcsFargateDeploymentDefaultsInput = {
  readonly projectName: string;
  readonly repositoryRevision: string;
  readonly sourceRoot: string;
  readonly dockerfilePath: string;
  readonly ecsWeb?: EcsWebBuildConfig | null;
};

export const systemManagedFields = [
  "commitSha",
  "codeBuildProjectName",
  "ecrRepositoryName",
  "clusterName",
  "serviceName",
  "containerName",
  "functionLogicalId",
  "functionName",
  "aliasName",
  "codeDeployApplicationName",
  "codeDeployDeploymentGroupName",
  "autoScalingGroupName",
  "hostingBucketName",
  "cloudFrontDistributionId",
  "cloudFrontOriginId"
] as const;

export type SystemManagedField = (typeof systemManagedFields)[number];

type ProjectDeploymentRepositoryEvidence = {
  readonly name: string;
  readonly repositoryRevision: string;
  readonly aiHandoff?: RepositoryAnalysisAiHandoff | undefined;
};

const runtimeBuildConfig: Record<
  RuntimeTargetKind,
  { buildPreset: BuildExecutionPreset; evidenceKind: BuildEvidenceKind }
> = {
  ecs_fargate: {
    buildPreset: "docker_build",
    evidenceKind: "dockerfile"
  },
  lambda: {
    buildPreset: "sam_build",
    evidenceKind: "sam_template"
  },
  ec2_asg: {
    buildPreset: "codedeploy_bundle",
    evidenceKind: "appspec"
  },
  static_site: {
    buildPreset: "static_export",
    evidenceKind: "static_output"
  }
};

export function createDeploymentTargetDraft(
  target: ProjectDeploymentTarget | null,
  connections: readonly AwsConnection[],
  sourceRepository?: SourceRepository | null,
  ecsDefaultsInput?: EcsFargateDeploymentDefaultsInput | null,
  mode: "preserve_target" | "prefer_ecs_defaults" = "preserve_target",
  diagramJson?: DiagramJson | null,
  repositoryAnalysisRecord?: RepositoryAnalysisRecord | null
): ProjectDeploymentTargetDraft {
  const repositoryEvidence = getProjectDeploymentRepositoryEvidence(
    sourceRepository,
    repositoryAnalysisRecord
  );
  const ecsDefaults =
    (!target || mode === "prefer_ecs_defaults") && ecsDefaultsInput
      ? createEcsFargateDeploymentDefaults(ecsDefaultsInput)
      : null;
  const preferEcsDefaults = mode === "prefer_ecs_defaults" && ecsDefaults !== null;
  const runtimeTargetKind = preferEcsDefaults
    ? "ecs_fargate"
    : (target?.runtimeTargetKind ??
      ecsDefaults?.runtimeTargetKind ??
      inferRuntimeTargetKind(diagramJson, repositoryEvidence) ??
      "ecs_fargate");
  const config = preferEcsDefaults ? null : target?.confirmedBuildConfig;
  const ecsConfig =
    target?.runtimeConfig?.runtimeTargetKind === "ecs_fargate" ? target.runtimeConfig : null;
  const lambdaConfig =
    target?.runtimeConfig?.runtimeTargetKind === "lambda" ? target.runtimeConfig : null;
  const ec2AsgConfig =
    target?.runtimeConfig?.runtimeTargetKind === "ec2_asg" ? target.runtimeConfig : null;
  const staticConfig =
    target?.runtimeConfig?.runtimeTargetKind === "static_site" ? target.runtimeConfig : null;
  const suggestion = getEvidenceSuggestion(runtimeTargetKind, repositoryEvidence);
  const architectureDefaults =
    runtimeTargetKind === "ecs_fargate" ? getEcsFargateArchitectureDefaults(diagramJson) : null;
  const inferredEcsWeb =
    runtimeTargetKind === "ecs_fargate" && hasWebInclusiveEcsArchitecture(diagramJson)
      ? inferEcsWebBuildConfig(repositoryEvidence?.aiHandoff, architectureDefaults)
      : null;
  const selectedEcsWeb =
    runtimeTargetKind === "ecs_fargate"
      ? (config?.ecsWeb ?? ecsDefaults?.ecsWeb ?? inferredEcsWeb)
      : null;
  const ecsRequiredRuntimeSecrets = normalizeRuntimeSecretNames([
    ...(config?.ecsWeb?.api.requiredRuntimeSecrets ?? []),
    ...(ecsDefaults?.ecsWeb?.api.requiredRuntimeSecrets ?? []),
    ...(inferredEcsWeb?.api.requiredRuntimeSecrets ?? []),
    ...((repositoryEvidence?.aiHandoff?.architectureFacts ?? [])
      .filter((fact) => fact.kind === "runtime_secret")
      .map((fact) => fact.value) ?? [])
  ]);
  const ecsWeb = selectedEcsWeb
    ? withRequiredRuntimeSecrets(selectedEcsWeb, ecsRequiredRuntimeSecrets)
    : null;
  const repositoryRuntimeNames =
    runtimeTargetKind === "ecs_fargate" && repositoryEvidence
      ? createEcsFargateRuntimeNames(repositoryEvidence.name)
      : null;
  const defaultEcrRepositoryName = firstNonBlank(
    ecsDefaults?.ecrRepositoryName,
    architectureDefaults?.ecrRepositoryName,
    repositoryRuntimeNames?.ecrRepositoryName
  );
  const codeBuildProjectName = preferEcsDefaults
    ? firstNonBlank(ecsConfig?.codeBuildProjectName, ecsDefaults.codeBuildProjectName)
    : firstNonBlank(
        target?.runtimeConfig?.codeBuildProjectName,
        ecsDefaults?.codeBuildProjectName,
        architectureDefaults?.codeBuildProjectName,
        defaultEcrRepositoryName ? `${defaultEcrRepositoryName}-build` : null
      );
  const ecrRepositoryName = preferEcsDefaults
    ? firstNonBlank(ecsConfig?.ecrRepositoryName, ecsDefaults.ecrRepositoryName)
    : firstNonBlank(
        ecsConfig?.ecrRepositoryName,
        ecsDefaults?.ecrRepositoryName,
        architectureDefaults?.ecrRepositoryName,
        repositoryRuntimeNames?.ecrRepositoryName
      );
  const clusterName = preferEcsDefaults
    ? firstNonBlank(ecsConfig?.clusterName, ecsDefaults.clusterName)
    : firstNonBlank(
        ecsConfig?.clusterName,
        ecsDefaults?.clusterName,
        architectureDefaults?.clusterName,
        repositoryRuntimeNames?.clusterName
      );
  const serviceName = preferEcsDefaults
    ? firstNonBlank(ecsConfig?.serviceName, ecsDefaults.serviceName)
    : firstNonBlank(
        ecsConfig?.serviceName,
        ecsDefaults?.serviceName,
        architectureDefaults?.serviceName,
        repositoryRuntimeNames?.serviceName
      );
  const containerName = preferEcsDefaults
    ? firstNonBlank(ecsConfig?.containerName, ecsDefaults.containerName)
    : firstNonBlank(
        ecsConfig?.containerName,
        ecsDefaults?.containerName,
        architectureDefaults?.containerName,
        repositoryRuntimeNames?.containerName
      );
  const verifiedConnections = connections.filter((item) => item.status === "verified");
  return {
    connectionId:
      target?.connectionId ?? (verifiedConnections.length === 1 ? verifiedConnections[0]!.id : ""),
    runtimeTargetKind,
    sourceRoot: firstNonBlank(
      ecsWeb?.api.sourceRoot,
      config?.sourceRoot,
      ecsDefaults?.sourceRoot,
      suggestion?.sourceRoot,
      "."
    ),
    evidencePath: firstNonBlank(
      ecsWeb?.api.dockerfilePath,
      config?.evidence[0]?.path,
      ecsDefaults?.evidencePath,
      suggestion?.evidencePath
    ),
    commitSha: firstNonBlank(
      config?.confirmedCommitSha,
      ecsDefaults?.commitSha,
      suggestion?.commitSha
    ),
    version: config?.exactSemVerTag ?? config?.manifestVersion ?? "",
    installPreset: config?.installPreset ?? suggestion?.installPreset ?? "none",
    healthCheckPath: firstNonBlank(
      ecsWeb?.api.healthCheckPath,
      config?.healthCheckPath,
      architectureDefaults?.healthCheckPath,
      ecsDefaults?.healthCheckPath,
      "/health"
    ),
    codeBuildProjectName,
    ecrRepositoryName,
    clusterName,
    serviceName,
    containerName,
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
      (preferEcsDefaults ? null : lambdaConfig?.outputUrl) ??
      (preferEcsDefaults ? null : ec2AsgConfig?.outputUrl) ??
      (preferEcsDefaults ? null : staticConfig?.outputUrl) ??
      ecsDefaults?.outputUrl ??
      "",
    ecsWeb,
    ecsRequiredRuntimeSecrets,
    evidenceSuggested: Boolean(ecsDefaults || suggestion)
  };
}

function hasWebInclusiveEcsArchitecture(diagramJson?: DiagramJson | null): boolean {
  if (!diagramJson) return false;
  const resourceTypes = new Set(
    diagramJson.nodes.map((node) => node.parameters?.resourceType).filter(Boolean)
  );
  return (
    resourceTypes.has("aws_s3_bucket") &&
    resourceTypes.has("aws_cloudfront_distribution") &&
    resourceTypes.has("aws_ecs_service")
  );
}

function inferRuntimeTargetKind(
  diagramJson: DiagramJson | null | undefined,
  repositoryEvidence: ProjectDeploymentRepositoryEvidence | null
): RuntimeTargetKind | null {
  const resourceTypes = new Set(
    diagramJson?.nodes.map((node) => node.parameters?.resourceType).filter(Boolean) ?? []
  );
  if (resourceTypes.has("aws_ecs_service")) return "ecs_fargate";
  if (resourceTypes.has("aws_lambda_function")) return "lambda";
  if (resourceTypes.has("aws_autoscaling_group")) return "ec2_asg";
  if (resourceTypes.has("aws_cloudfront_distribution")) return "static_site";

  const evidence = repositoryEvidence?.aiHandoff?.evidence ?? [];
  if (evidence.some((item) => item.kind === "dockerfile")) return "ecs_fargate";
  if (
    evidence.some(
      (item) => item.kind === "framework_config" && /(?:^|\/)template\.ya?ml$/i.test(item.path)
    )
  ) {
    return "lambda";
  }
  if (
    evidence.some(
      (item) => item.kind === "framework_config" && /(?:^|\/)appspec\.ya?ml$/i.test(item.path)
    )
  ) {
    return "ec2_asg";
  }
  if (evidence.some((item) => item.kind === "static_output")) return "static_site";
  return null;
}

export function inferEcsWebBuildConfig(
  handoff?: RepositoryAnalysisAiHandoff,
  architectureDefaults?: { healthCheckPath: string } | null
): EcsWebBuildConfig | null {
  if (!handoff) return null;
  const frontendUnits = handoff.applicationUnits.filter(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  const dockerEvidence = handoff.evidence.filter((item) => item.kind === "dockerfile");
  if (frontendUnits.length !== 1 || dockerEvidence.length !== 1) return null;

  const frontendUnit = frontendUnits[0]!;
  const dockerfile = dockerEvidence[0]!;
  const packageManifests = handoff.evidence.filter(
    (item) => item.kind === "package_json" && item.applicationUnitId === frontendUnit.id
  );
  const staticOutputs = handoff.evidence.filter(
    (item) => item.kind === "static_output" && item.applicationUnitId === frontendUnit.id
  );
  if (packageManifests.length !== 1 || staticOutputs.length !== 1) return null;

  const lockfile = selectFrontendLockfile(
    handoff.evidence.filter((item) => item.kind === "lockfile").map((item) => item.path),
    frontendUnit.rootPath
  );
  const packageManager = lockfile
    ? getEcsWebPackageManagerDefaultsForLockfile(lockfile)
    : null;
  if (!lockfile || !packageManager) return null;

  const hasRootPackageManifest = handoff.evidence.some(
    (item) => item.kind === "package_json" && item.path === "package.json"
  );
  const apiSourceRoot =
    hasRootPackageManifest && dockerfile.path.includes("/")
      ? "."
      : (handoff.applicationUnits.find((unit) => unit.id === dockerfile.applicationUnitId)
          ?.rootPath ?? getParentRepositoryPath(dockerfile.path));
  const healthCheckPath = architectureDefaults?.healthCheckPath || "/health";
  const requiredRuntimeSecrets = [
    ...new Set(
      (handoff.architectureFacts ?? [])
        .filter((fact) => fact.kind === "runtime_secret")
        .map((fact) => fact.value)
    )
  ].sort((left, right) => left.localeCompare(right));

  return {
    api: {
      sourceRoot: apiSourceRoot,
      dockerfilePath: dockerfile.path,
      containerPort: 8080,
      healthCheckPath,
      ...(requiredRuntimeSecrets.length > 0 ? { requiredRuntimeSecrets } : {})
    },
    frontend: {
      sourceRoot: frontendUnit.rootPath,
      packageManifestPath: packageManifests[0]!.path,
      lockfilePath: lockfile,
      packageManager: packageManager.kind,
      packageManagerVersion: packageManager.version,
      installPreset: packageManager.installPreset,
      buildPreset: packageManager.buildPreset,
      outputPath: staticOutputs[0]!.path
    }
  };
}

function selectFrontendLockfile(paths: readonly string[], sourceRoot: string): string | null {
  const scoped = paths.filter((path) => path.startsWith(`${sourceRoot}/`));
  if (scoped.length === 1) return scoped[0]!;
  const root = paths.filter((path) => !path.includes("/"));
  return root.length === 1 ? root[0]! : null;
}

function getParentRepositoryPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "." : path.slice(0, separator);
}

function getEcsFargateArchitectureDefaults(diagramJson?: DiagramJson | null): {
  codeBuildProjectName: string;
  ecrRepositoryName: string;
  clusterName: string;
  serviceName: string;
  containerName: string;
  healthCheckPath: string;
} | null {
  if (!diagramJson) return null;

  const codeBuildValues = getSingleResourceValues(diagramJson, "aws_codebuild_project");
  const ecrValues = getSingleResourceValues(diagramJson, "aws_ecr_repository");
  const clusterValues = getSingleResourceValues(diagramJson, "aws_ecs_cluster");
  const serviceValues = getSingleResourceValues(diagramJson, "aws_ecs_service");
  const targetGroupValues = getSingleResourceValues(diagramJson, "aws_lb_target_group");
  const ecrRepositoryName = readString(ecrValues, "name");
  const loadBalancer = readRecord(serviceValues, "loadBalancer");
  const healthCheck = readRecord(targetGroupValues, "healthCheck");

  return {
    codeBuildProjectName: firstNonBlank(
      readString(codeBuildValues, "name"),
      ecrRepositoryName ? `${ecrRepositoryName}-build` : null
    ),
    ecrRepositoryName,
    clusterName: readString(clusterValues, "name"),
    serviceName: readString(serviceValues, "name"),
    containerName: readString(loadBalancer, "containerName"),
    healthCheckPath: readString(healthCheck, "path")
  };
}

function getSingleResourceValues(
  diagramJson: DiagramJson,
  resourceType: string
): Record<string, unknown> | null {
  const matches = diagramJson.nodes.filter(
    (node) => node.parameters?.resourceType === resourceType
  );
  return matches.length === 1 ? (matches[0]?.parameters?.values ?? null) : null;
}

function readRecord(
  values: Record<string, unknown> | null,
  key: string
): Record<string, unknown> | null {
  const value = values?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(values: Record<string, unknown> | null, key: string): string {
  const value = values?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function firstNonBlank(...values: readonly (string | null | undefined)[]): string {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

export function createEcsFargateDeploymentDefaults(
  input: EcsFargateDeploymentDefaultsInput
): Pick<
  ProjectDeploymentTargetDraft,
  | "runtimeTargetKind"
  | "sourceRoot"
  | "evidencePath"
  | "commitSha"
  | "codeBuildProjectName"
  | "ecrRepositoryName"
  | "clusterName"
  | "serviceName"
  | "containerName"
  | "healthCheckPath"
  | "outputUrl"
  | "ecsWeb"
> {
  const runtimeNames = createEcsFargateRuntimeNames(input.projectName);
  const ecrRepositoryName = input.ecsWeb
    ? runtimeNames.ecrRepositoryName.replace(/-app$/u, "-api")
    : runtimeNames.ecrRepositoryName;

  return {
    runtimeTargetKind: "ecs_fargate",
    sourceRoot: input.ecsWeb?.api.sourceRoot ?? (input.sourceRoot.trim() || "."),
    evidencePath: input.dockerfilePath.trim() || "Dockerfile",
    commitSha: input.repositoryRevision.trim().toLowerCase(),
    codeBuildProjectName: `${ecrRepositoryName}-build`,
    ecrRepositoryName,
    clusterName: runtimeNames.clusterName,
    serviceName: runtimeNames.serviceName,
    containerName: input.ecsWeb ? "api" : runtimeNames.containerName,
    healthCheckPath: input.ecsWeb?.api.healthCheckPath ?? "/",
    outputUrl: "",
    ecsWeb: input.ecsWeb ?? null
  };
}

export function changeDeploymentTargetRuntime(
  draft: ProjectDeploymentTargetDraft,
  runtimeTargetKind: RuntimeTargetKind,
  sourceRepository?: SourceRepository | null,
  repositoryAnalysisRecord?: RepositoryAnalysisRecord | null
): ProjectDeploymentTargetDraft {
  const suggestion = getEvidenceSuggestion(
    runtimeTargetKind,
    getProjectDeploymentRepositoryEvidence(sourceRepository, repositoryAnalysisRecord)
  );
  return {
    ...draft,
    runtimeTargetKind,
    sourceRoot: suggestion?.sourceRoot ?? ".",
    evidencePath: suggestion?.evidencePath ?? "",
    commitSha: suggestion?.commitSha ?? "",
    installPreset: suggestion?.installPreset ?? "none",
    healthCheckPath:
      runtimeTargetKind === "ecs_fargate" ||
      runtimeTargetKind === "lambda" ||
      runtimeTargetKind === "ec2_asg"
        ? draft.healthCheckPath || "/health"
        : "",
    outputUrl: "",
    ecsWeb: runtimeTargetKind === "ecs_fargate" ? draft.ecsWeb : null,
    evidenceSuggested: Boolean(suggestion)
  };
}

export function updateDeploymentTargetDraftField<
  K extends keyof ProjectDeploymentTargetDraft
>(
  draft: ProjectDeploymentTargetDraft,
  key: K,
  value: ProjectDeploymentTargetDraft[K]
): ProjectDeploymentTargetDraft {
  const next = { ...draft, [key]: value };
  if (key === "ecsWeb") {
    return replaceDeploymentTargetEcsWeb(
      next,
      value as ProjectDeploymentTargetDraft["ecsWeb"]
    );
  }
  if (key === "ecsRequiredRuntimeSecrets" && next.ecsWeb) {
    return replaceDeploymentTargetEcsWeb(next, next.ecsWeb);
  }
  if (!next.ecsWeb) return next;

  if (key === "sourceRoot") {
    return {
      ...next,
      ecsWeb: {
        ...next.ecsWeb,
        api: { ...next.ecsWeb.api, sourceRoot: value as string }
      }
    };
  }
  if (key === "evidencePath") {
    return {
      ...next,
      ecsWeb: {
        ...next.ecsWeb,
        api: { ...next.ecsWeb.api, dockerfilePath: value as string }
      }
    };
  }
  if (key === "healthCheckPath") {
    return {
      ...next,
      ecsWeb: {
        ...next.ecsWeb,
        api: { ...next.ecsWeb.api, healthCheckPath: value as string }
      }
    };
  }
  return next;
}

export function replaceDeploymentTargetEcsWeb(
  draft: ProjectDeploymentTargetDraft,
  ecsWeb: EcsWebBuildConfig | null
): ProjectDeploymentTargetDraft {
  if (!ecsWeb) return { ...draft, ecsWeb: null };
  const ecsRequiredRuntimeSecrets = normalizeRuntimeSecretNames([
    ...draft.ecsRequiredRuntimeSecrets,
    ...(ecsWeb.api.requiredRuntimeSecrets ?? [])
  ]);
  const normalizedEcsWeb = withRequiredRuntimeSecrets(ecsWeb, ecsRequiredRuntimeSecrets);
  return {
    ...draft,
    sourceRoot: normalizedEcsWeb.api.sourceRoot,
    evidencePath: normalizedEcsWeb.api.dockerfilePath,
    healthCheckPath: normalizedEcsWeb.api.healthCheckPath,
    ecsWeb: normalizedEcsWeb,
    ecsRequiredRuntimeSecrets
  };
}

export function createManualEcsWebDraft(
  draft: ProjectDeploymentTargetDraft,
  packageManager: PackageManagerKind
): ProjectDeploymentTargetDraft {
  return replaceDeploymentTargetEcsWeb(
    draft,
    createEditableEcsWebBuildConfig({
      sourceRoot: draft.sourceRoot,
      dockerfilePath: draft.evidencePath,
      healthCheckPath: draft.healthCheckPath,
      requiredRuntimeSecrets: draft.ecsRequiredRuntimeSecrets,
      packageManager
    })
  );
}

export function getLockedSystemFields(
  draft: ProjectDeploymentTargetDraft,
  savedTarget: ProjectDeploymentTarget | null
): ReadonlySet<SystemManagedField> {
  const lockableFields = savedTarget ? systemManagedFields : (["commitSha"] as const);
  return new Set(lockableFields.filter((field) => draft[field].trim().length > 0));
}

export function getLockedSystemFieldsAfterRuntimeChange(
  current: ReadonlySet<SystemManagedField>,
  nextCommitSha: string
): ReadonlySet<SystemManagedField> {
  return new Set(current.has("commitSha") && nextCommitSha.trim() ? ["commitSha"] : []);
}

export function getDeploymentTargetOutputUrlSummary(
  draft: Pick<ProjectDeploymentTargetDraft, "runtimeTargetKind" | "outputUrl">
): string {
  if (draft.outputUrl.trim()) return draft.outputUrl.trim();
  return draft.runtimeTargetKind === "ecs_fargate"
    ? "첫 배포 후 자동 입력"
    : "저장 전 입력 필요";
}

export function formatDeploymentTargetUpdatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

export type MissingDeploymentTargetFieldKey =
  | "aws_connection"
  | "source_root"
  | "build_evidence_path"
  | "confirmed_commit_sha"
  | "health_check_path"
  | "install_preset"
  | "codebuild_project"
  | "ecr_repository"
  | "ecs_cluster"
  | "ecs_service"
  | "container"
  | "ecs_web_build_config"
  | "lambda_function_logical_id"
  | "lambda_function"
  | "lambda_alias"
  | "codedeploy_application"
  | "codedeploy_deployment_group"
  | "auto_scaling_group"
  | "hosting_bucket"
  | "cloudfront_distribution"
  | "cloudfront_origin"
  | "output_url";

export function getMissingDeploymentTargetFieldKeys(
  draft: ProjectDeploymentTargetDraft,
  connections: readonly AwsConnection[]
): MissingDeploymentTargetFieldKey[] {
  const missing: MissingDeploymentTargetFieldKey[] = [];
  if (
    !connections.some(
      (connection) => connection.id === draft.connectionId && connection.status === "verified"
    )
  ) {
    missing.push("aws_connection");
  }
  if (!draft.sourceRoot.trim()) missing.push("source_root");
  if (!draft.evidencePath.trim()) missing.push("build_evidence_path");
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(draft.commitSha)) {
    missing.push("confirmed_commit_sha");
  }
  if (!draft.codeBuildProjectName.trim()) missing.push("codebuild_project");

  if (draft.runtimeTargetKind !== "static_site" && !/^\//.test(draft.healthCheckPath)) {
    missing.push("health_check_path");
  }
  switch (draft.runtimeTargetKind) {
    case "ecs_fargate":
      if (!draft.ecrRepositoryName.trim()) missing.push("ecr_repository");
      if (!draft.clusterName.trim()) missing.push("ecs_cluster");
      if (!draft.serviceName.trim()) missing.push("ecs_service");
      if (!draft.containerName.trim()) missing.push("container");
      if (getEcsWebBuildConfigIssueKeys(draft.ecsWeb).length > 0) {
        missing.push("ecs_web_build_config");
      }
      break;
    case "lambda":
      if (!draft.functionLogicalId.trim()) missing.push("lambda_function_logical_id");
      if (!draft.functionName.trim()) missing.push("lambda_function");
      if (!draft.aliasName.trim()) missing.push("lambda_alias");
      if (!draft.codeDeployApplicationName.trim()) missing.push("codedeploy_application");
      if (!draft.codeDeployDeploymentGroupName.trim()) {
        missing.push("codedeploy_deployment_group");
      }
      break;
    case "ec2_asg":
      if (!draft.codeDeployApplicationName.trim()) missing.push("codedeploy_application");
      if (!draft.codeDeployDeploymentGroupName.trim()) {
        missing.push("codedeploy_deployment_group");
      }
      if (!draft.autoScalingGroupName.trim()) missing.push("auto_scaling_group");
      break;
    case "static_site":
      if (draft.installPreset === "none") missing.push("install_preset");
      if (!draft.hostingBucketName.trim()) missing.push("hosting_bucket");
      if (!draft.cloudFrontDistributionId.trim()) missing.push("cloudfront_distribution");
      if (!draft.cloudFrontOriginId.trim()) missing.push("cloudfront_origin");
      break;
  }

  const outputUrl = draft.outputUrl.trim();
  if (
    (draft.runtimeTargetKind === "ecs_fargate" && outputUrl && !hasSafeHttpsOutputUrl(outputUrl)) ||
    (draft.runtimeTargetKind !== "ecs_fargate" && !hasSafeHttpsOutputUrl(outputUrl))
  ) {
    missing.push("output_url");
  }
  return missing;
}

export function isDeploymentTargetDraftReady(
  draft: ProjectDeploymentTargetDraft,
  connections: readonly AwsConnection[]
): boolean {
  return getMissingDeploymentTargetFieldKeys(draft, connections).length === 0;
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
  const ecsWeb = draft.runtimeTargetKind === "ecs_fargate" ? draft.ecsWeb : null;
  if (draft.runtimeTargetKind === "ecs_fargate" && !ecsWeb) {
    throw new Error("ECS web build configuration is required.");
  }
  const evidence: { kind: BuildEvidenceKind; path: string }[] = ecsWeb
    ? [
        { kind: "dockerfile", path: ecsWeb.api.dockerfilePath.trim() },
        { kind: "package_manifest", path: ecsWeb.frontend.packageManifestPath.trim() },
        { kind: "static_output", path: ecsWeb.frontend.outputPath.trim() }
      ]
    : [{ kind: runtime.evidenceKind, path: evidencePath }];

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
            outputUrl: draft.outputUrl.trim() || null
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
      sourceRoot: ecsWeb?.api.sourceRoot.trim() ?? draft.sourceRoot.trim(),
      evidence,
      installPreset: draft.runtimeTargetKind === "static_site" ? draft.installPreset : "none",
      buildPreset: runtime.buildPreset,
      artifactOutputPath: draft.runtimeTargetKind === "static_site" ? evidencePath : null,
      runtimeEntrypoint: null,
      healthCheckPath:
        ecsWeb?.api.healthCheckPath.trim() ??
        (draft.runtimeTargetKind === "lambda" || draft.runtimeTargetKind === "ec2_asg"
          ? draft.healthCheckPath.trim()
          : null),
      dockerfilePath: ecsWeb?.api.dockerfilePath.trim() ?? null,
      packageManifestPath: ecsWeb?.frontend.packageManifestPath.trim() ?? null,
      samTemplatePath: draft.runtimeTargetKind === "lambda" ? evidencePath : null,
      appSpecPath: draft.runtimeTargetKind === "ec2_asg" ? evidencePath : null,
      staticOutputPath: draft.runtimeTargetKind === "static_site" ? evidencePath : null,
      exactSemVerTag: version?.startsWith("v") ? version : null,
      manifestVersion: version?.startsWith("v") ? null : version,
      confirmedCommitSha: draft.commitSha.toLowerCase(),
      confirmedAt: confirmedAt.toISOString(),
      ecsWeb
    }
  };
}

function getEvidenceSuggestion(
  runtimeTargetKind: RuntimeTargetKind,
  repositoryEvidence?: ProjectDeploymentRepositoryEvidence | null
): {
  sourceRoot: string;
  evidencePath: string;
  commitSha: string;
  installPreset: BuildInstallPreset;
} | null {
  if (
    !repositoryEvidence ||
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(repositoryEvidence.repositoryRevision)
  ) {
    return null;
  }
  const handoff = repositoryEvidence.aiHandoff;
  if (!handoff || !Array.isArray(handoff.evidence) || !Array.isArray(handoff.applicationUnits))
    return null;
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
    commitSha: repositoryEvidence.repositoryRevision.toLowerCase(),
    installPreset:
      runtimeTargetKind === "static_site"
        ? inferInstallPreset(handoff.evidence, sourceRoot)
        : "none"
  };
}

function getProjectDeploymentRepositoryEvidence(
  sourceRepository?: SourceRepository | null,
  repositoryAnalysisRecord?: RepositoryAnalysisRecord | null
): ProjectDeploymentRepositoryEvidence | null {
  if (repositoryAnalysisRecord) {
    return {
      name: repositoryAnalysisRecord.name,
      repositoryRevision: repositoryAnalysisRecord.repositoryRevision,
      aiHandoff: repositoryAnalysisRecord.analysisResult.aiHandoff
    };
  }
  if (
    sourceRepository?.status === "active" &&
    !sourceRepository.archived &&
    sourceRepository.analysis
  ) {
    return {
      name: sourceRepository.name,
      repositoryRevision: sourceRepository.analysis.repositoryRevision,
      aiHandoff: sourceRepository.analysis.aiHandoff
    };
  }
  return null;
}

function inferInstallPreset(
  evidence: readonly { kind: string; path: string }[],
  sourceRoot: string
): BuildInstallPreset {
  const lockfiles = evidence
    .filter((item) => item.kind === "lockfile")
    .map((item) => item.path.toLowerCase());
  const normalizedRoot = sourceRoot.replace(/^\.\//, "").replace(/\/$/, "").toLowerCase() || ".";
  const scopedLockfiles =
    normalizedRoot === "."
      ? lockfiles.filter((path) => !path.includes("/"))
      : lockfiles.filter(
          (path) =>
            path.startsWith(`${normalizedRoot}/`) &&
            !path.slice(normalizedRoot.length + 1).includes("/")
        );
  const candidates =
    scopedLockfiles.length > 0 ? scopedLockfiles : lockfiles.filter((path) => !path.includes("/"));
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

function hasSafeHttpsOutputUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function normalizeRuntimeSecretNames(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function withRequiredRuntimeSecrets(
  ecsWeb: EcsWebBuildConfig,
  names: readonly string[]
): EcsWebBuildConfig {
  const requiredRuntimeSecrets = normalizeRuntimeSecretNames([
    ...(ecsWeb.api.requiredRuntimeSecrets ?? []),
    ...names
  ]);
  return {
    ...ecsWeb,
    api: {
      ...ecsWeb.api,
      ...(requiredRuntimeSecrets.length > 0 ? { requiredRuntimeSecrets } : {})
    }
  };
}
