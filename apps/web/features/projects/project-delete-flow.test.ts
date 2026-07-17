import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Deployment, ProjectDeletePreview } from "@sketchcatch/types";
import {
  getDestroyDeleteAcknowledgedWarningIds,
  isDestroyPlanReadyForApproval,
  shouldShowProjectOnlyDeleteFallback
} from "./project-delete-flow";

const projectsClientSource = readProjectFile("../../app/projects/projects-client.tsx");

test("project delete dialog close clears the deleting project lock", () => {
  const closeDialogSource = getSourceBetween(
    projectsClientSource,
    "function closeDeleteDialog(): void {",
    "function renderDeleteDialog()"
  );

  assert.match(closeDialogSource, /setDeleteDialog\(\{ status: "closed" \}\);/);
  assert.match(closeDialogSource, /setDeletingProjectId\(null\);/);
});

test("destroy delete polling stops when the projects page unmounts", () => {
  const pollingSource = getSourceBetween(
    projectsClientSource,
    "async function waitForProjectDeployment(input:",
    "function compareProjectsBySortMode"
  );

  assert.match(projectsClientSource, /const isMountedRef = useRef\(true\);/);
  assert.match(projectsClientSource, /isMountedRef\.current = false;/);
  assert.match(pollingSource, /readonly checkMounted\?: \(\(\) => boolean\) \| undefined;/);
  assert.match(pollingSource, /input\.checkMounted\?\.\(\) === false/);
  assert.match(projectsClientSource, /checkMounted: \(\) => isMountedRef\.current/);
});

test("destroy delete failures expose a project-only fallback", () => {
  const preview = createPreview({
    availableActions: ["destroy_then_delete", "delete_project_only"]
  });

  assert.equal(
    shouldShowProjectOnlyDeleteFallback({
      errorMessage: "Terraform destroy failed because the resource no longer exists.",
      preview,
      selectedAction: "destroy_then_delete",
      status: "ready"
    }),
    true
  );
  assert.equal(
    shouldShowProjectOnlyDeleteFallback({
      errorMessage: "Terraform destroy failed because the resource no longer exists.",
      preview,
      selectedAction: "destroy_then_delete",
      status: "approval"
    }),
    true
  );
});

test("project-only fallback stays hidden without a destroy failure", () => {
  const preview = createPreview({
    availableActions: ["destroy_then_delete", "delete_project_only"]
  });

  assert.equal(
    shouldShowProjectOnlyDeleteFallback({
      errorMessage: undefined,
      preview,
      selectedAction: "destroy_then_delete",
      status: "ready"
    }),
    false
  );
  assert.equal(
    shouldShowProjectOnlyDeleteFallback({
      errorMessage: "Terraform destroy failed.",
      preview,
      selectedAction: "delete_project_only",
      status: "ready"
    }),
    false
  );
  assert.equal(
    shouldShowProjectOnlyDeleteFallback({
      errorMessage: "Terraform destroy failed.",
      preview: createPreview({ availableActions: ["destroy_then_delete"] }),
      selectedAction: "destroy_then_delete",
      status: "ready"
    }),
    false
  );
});

test("destroy delete approval acknowledges non-blocking destroy warnings", () => {
  const warningIds = getDestroyDeleteAcknowledgedWarningIds(
    createDeploymentWithWarnings([
      {
        blocksApproval: false,
        id: "terraform_plan:UNKNOWN_TERRAFORM_ACTION:destroy:no-op",
        requiresAcknowledgement: true
      },
      {
        blocksApproval: false,
        id: "terraform_plan:LOW_NOTE",
        requiresAcknowledgement: false
      },
      {
        blocksApproval: true,
        id: "terraform_plan:UNSUPPORTED_RESOURCE:destroy:aws_unsupported",
        requiresAcknowledgement: false
      }
    ])
  );

  assert.deepEqual(warningIds, ["terraform_plan:UNKNOWN_TERRAFORM_ACTION:destroy:no-op"]);
});

test("destroy delete approval has no warning acknowledgements without a plan summary", () => {
  assert.deepEqual(getDestroyDeleteAcknowledgedWarningIds(undefined), []);
  assert.deepEqual(getDestroyDeleteAcknowledgedWarningIds(createDeploymentWithWarnings([])), []);
  assert.deepEqual(
    getDestroyDeleteAcknowledgedWarningIds({
      ...createDeploymentWithWarnings([]),
      planSummary: {
        ...createDeploymentWithWarnings([]).planSummary,
        warnings: undefined
      }
    } as unknown as Deployment),
    []
  );
});

test("project deletion accepts a completed unapproved destroy plan", () => {
  const deployment = {
    ...createDeploymentWithWarnings([]),
    isBlocked: false
  };

  assert.equal(deployment.isBlocked, false);
  assert.equal(deployment.blockedBy, null);
  assert.equal(isDestroyPlanReadyForApproval(deployment), true);
});

test("project deletion accepts a destroy plan that preserves an apply failure", () => {
  const deployment = {
    ...createDeploymentWithWarnings([]),
    errorSummary: "Apply failed after creating resources.",
    failureStage: "apply" as const,
    isBlocked: false,
    status: "FAILED" as const
  };

  assert.equal(
    isDestroyPlanReadyForApproval(deployment),
    true,
    "a preserved apply failure must still advance to destroy approval"
  );
});

test("project deletion does not accept a stale destroy plan while planning is still running", () => {
  const deployment = createDeploymentWithWarnings([]);

  assert.equal(
    isDestroyPlanReadyForApproval({
      ...deployment,
      activeStage: "plan",
      status: "RUNNING"
    }),
    false
  );
});

function readProjectFile(filePath: string): string {
  return readFileSync(fileURLToPath(new URL(filePath, import.meta.url)), "utf8");
}

function getSourceBetween(source: string, startToken: string, endToken: string): string {
  const startIndex = source.indexOf(startToken);
  const endIndex = source.indexOf(endToken, startIndex);

  assert.ok(startIndex > -1, `Expected source to include ${startToken}`);
  assert.ok(endIndex > startIndex, `Expected source to include ${endToken} after ${startToken}`);

  return source.slice(startIndex, endIndex);
}

function createPreview(input: {
  readonly availableActions: ProjectDeletePreview["availableActions"];
}): ProjectDeletePreview {
  return {
    activeDeploymentCount: 1,
    activeDeploymentId: "deployment-1",
    activeResourceCount: 3,
    availableActions: input.availableActions,
    hasDeploymentHistory: true,
    hasPlanHistory: true,
    latestDeploymentStatus: "SUCCESS",
    message: "preview",
    mode: "active_resources",
    projectId: "project-1"
  };
}

function createDeploymentWithWarnings(
  warnings: Array<{
    readonly blocksApproval: boolean;
    readonly id: string;
    readonly requiresAcknowledgement: boolean;
  }>
): Deployment {
  return {
    activeStage: null,
    approvedAt: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    approvedByUserId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTerraformArtifactId: null,
    approvedTfplanHash: null,
    architectureId: "architecture-1",
    awsConnectionId: "aws-connection-1",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "123456789012",
    blockedBy: null,
    blockedReason: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    currentPlanArtifactId: "plan-1",
    currentPlanOperation: "destroy",
    errorSummary: null,
    failedAt: null,
    failureStage: null,
    id: "deployment-1",
    isBlocked: true,
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    planSummary: {
      blocked: false,
      createCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      updateCount: 0,
      warnings: warnings.map((warning) => ({
        category: "configuration",
        code: "UNKNOWN_TERRAFORM_ACTION",
        level: warning.blocksApproval ? "high" : "medium",
        message: warning.id,
        source: "terraform_plan",
        ...warning
      }))
    },
    projectId: "project-1",
    resultWarningSummary: null,
    startedAt: null,
    stateObjectKey: "deployments/deployment-1/state/terraform.tfstate",
    status: "SUCCESS",
    terraformArtifactId: "terraform-artifact-1",
    updatedAt: "2026-07-09T00:00:00.000Z"
  };
}
