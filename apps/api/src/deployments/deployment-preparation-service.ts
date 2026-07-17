import { createHash } from "node:crypto";
import type {
  ConfirmedBuildConfig,
  DeploymentConsolePhase,
  DeploymentScope,
  DeploymentStatus,
  DiagramJson,
  RuntimeTargetKind,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { DeploymentConflictError } from "./deployment-service.js";
import { findAnalysisExcludedTerraformConflicts } from "../services/terraform/analysis-excluded-terraform-guard.js";
import { listTerraformBlockIdentities } from "../services/terraform/terraform-to-diagram.js";

export type DeploymentPreparationDraft = {
  revision: number;
  diagramJson: DiagramJson;
  terraformFiles: TerraformSyncFileInput[] | null;
};

export type DeploymentPreparationTarget = {
  connectionId: string;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig | null;
};

export type DeploymentPreparationRepository = {
  findProjectDraftForPreparation(
    projectId: string
  ): Promise<DeploymentPreparationDraft | undefined>;
  findProjectTargetForPreparation(
    projectId: string
  ): Promise<DeploymentPreparationTarget | undefined>;
};

export type ResolveDeploymentPreparationInput = {
  projectId: string;
  awsConnectionId: string;
  draftRevision: number;
  requestedScope: DeploymentScope | "auto";
};

export type ResolvedDeploymentPreparation = {
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  preparedDraftRevision: number;
  preparedSnapshotHash: string;
};

export async function resolveDeploymentPreparation(
  input: ResolveDeploymentPreparationInput,
  repository: DeploymentPreparationRepository
): Promise<ResolvedDeploymentPreparation> {
  const draft = await repository.findProjectDraftForPreparation(input.projectId);
  if (!draft) {
    throw new DeploymentConflictError("A saved draft is required before deployment prepare");
  }
  if (draft.revision !== input.draftRevision) {
    throw new DeploymentConflictError(
      `Project draft revision is stale: expected ${draft.revision}, received ${input.draftRevision}`
    );
  }

  assertDraftTerraformDoesNotIncludeAnalysisExcludedResource(draft);

  const target = await repository.findProjectTargetForPreparation(input.projectId);
  const scope =
    input.requestedScope === "auto"
      ? detectDeploymentScope({ draft, target })
      : input.requestedScope;

  if (scope !== "infrastructure") {
    if (!target?.confirmedBuildConfig) {
      throw new DeploymentConflictError(
        "A confirmed project deployment target is required for application deployment"
      );
    }
    if (target.connectionId !== input.awsConnectionId) {
      throw new DeploymentConflictError(
        "Deployment connection must match the confirmed project target connection"
      );
    }
  }

  return {
    scope,
    targetKind: scope === "infrastructure" ? null : target?.runtimeTargetKind ?? null,
    preparedDraftRevision: draft.revision,
    preparedSnapshotHash: createPreparedDraftSnapshotHash(draft)
  };
}

export function assertDraftTerraformDoesNotIncludeAnalysisExcludedResource(
  draft: DeploymentPreparationDraft
): void {
  const terraformFiles = draft.terraformFiles?.filter((file) => file.fileName.endsWith(".tf")) ?? [];
  const conflicts = findAnalysisExcludedTerraformConflicts(
    draft.diagramJson,
    listTerraformBlockIdentities({ terraformCode: "", terraformFiles })
  );

  if (conflicts.length === 0) {
    return;
  }

  throw new DeploymentConflictError(createAnalysisExcludedDeploymentMessage(conflicts[0]!));
}

export function createAnalysisExcludedDeploymentMessage(conflict: {
  resourceAddress: string;
}): string {
  return `${conflict.resourceAddress} matches an analysis-excluded resource and cannot be prepared for deployment`;
}

export function detectDeploymentScope({
  draft,
  target
}: {
  draft: DeploymentPreparationDraft;
  target: DeploymentPreparationTarget | undefined;
}): DeploymentScope {
  const hasTerraform = Boolean(
    draft.terraformFiles?.some((file) => file.terraformCode.trim().length > 0)
  );
  const hasApplication = Boolean(target?.confirmedBuildConfig);
  if (hasTerraform && hasApplication) return "full_stack";
  if (hasApplication) return "application";
  return "infrastructure";
}

export function createPreparedDraftSnapshotHash(value: {
  revision: number;
  diagramJson: DiagramJson;
  terraformFiles: TerraformSyncFileInput[] | null;
}): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function getDeploymentConsolePhase(deployment: {
  status: DeploymentStatus;
  currentPlanArtifactId: string | null;
  approvedAt: Date | string | null;
}): DeploymentConsolePhase {
  if (["SUCCESS", "FAILED", "CANCELLED", "DESTROYED"].includes(deployment.status)) {
    return "deployment";
  }
  if (!deployment.currentPlanArtifactId) return "validation";
  if (!deployment.approvedAt) return "approval";
  return "deployment";
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  const toJSON = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof toJSON === "function") {
    return canonicalJson(toJSON.call(value));
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}
