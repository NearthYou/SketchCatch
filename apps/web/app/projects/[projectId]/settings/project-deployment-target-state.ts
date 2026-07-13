import type {
  AwsConnection,
  BuildEvidenceKind,
  BuildExecutionPreset,
  ProjectDeploymentTarget,
  PutProjectDeploymentTargetRequest,
  RuntimeTargetKind
} from "@sketchcatch/types";

export type ProjectDeploymentTargetDraft = {
  connectionId: string;
  runtimeTargetKind: RuntimeTargetKind;
  sourceRoot: string;
  evidencePath: string;
  commitSha: string;
  version: string;
  healthCheckPath: string;
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
  connections: readonly AwsConnection[]
): ProjectDeploymentTargetDraft {
  const runtimeTargetKind = target?.runtimeTargetKind ?? "ecs_fargate";
  const config = target?.confirmedBuildConfig;
  return {
    connectionId:
      target?.connectionId ?? connections.find((item) => item.status === "verified")?.id ?? "",
    runtimeTargetKind,
    sourceRoot: config?.sourceRoot ?? ".",
    evidencePath: config?.evidence[0]?.path ?? getDefaultDeploymentEvidencePath(runtimeTargetKind),
    commitSha: config?.confirmedCommitSha ?? "",
    version: config?.exactSemVerTag ?? config?.manifestVersion ?? "",
    healthCheckPath: config?.healthCheckPath ?? "/health"
  };
}

export function getDefaultDeploymentEvidencePath(runtimeTargetKind: RuntimeTargetKind): string {
  return runtimeBuildConfig[runtimeTargetKind].defaultPath;
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
    (draft.runtimeTargetKind !== "ecs_fargate" || /^\//.test(draft.healthCheckPath))
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
