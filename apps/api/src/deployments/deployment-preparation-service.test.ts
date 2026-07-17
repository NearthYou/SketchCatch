import assert from "node:assert/strict";
import test from "node:test";
import type { ConfirmedBuildConfig, DiagramJson } from "@sketchcatch/types";
import {
  assertDraftTerraformDoesNotIncludeAnalysisExcludedResource,
  resolveDeploymentPreparation,
  type DeploymentPreparationDraft,
  type DeploymentPreparationRepository,
  type DeploymentPreparationTarget
} from "./deployment-preparation-service.js";
import { DeploymentConflictError } from "./deployment-service.js";

const diagramJson: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const excludedDiagram: DiagramJson = {
  nodes: [
    {
      id: "legacy-lambda",
      type: "aws_lambda_function",
      kind: "resource",
      label: "Legacy Lambda",
      position: { x: 0, y: 0 },
      size: { width: 120, height: 80 },
      locked: false,
      zIndex: 1,
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda",
        fileName: "compute.tf",
        values: { analysisExcluded: true }
      }
    }
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("does not treat a commented excluded Lambda as a deployable block when a supported VPC exists", () => {
  assert.doesNotThrow(() =>
    assertDraftTerraformDoesNotIncludeAnalysisExcludedResource({
      revision: 1,
      diagramJson: excludedDiagram,
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: `/* resource "aws_lambda_function" "legacy_lambda" {} */
// resource "aws_lambda_function" "legacy_lambda" {}
resource "aws_vpc" "main" {}`
        }
      ]
    })
  );
});

test("selects full_stack, application, and explicit infrastructure scopes", async () => {
  const withTerraform = createDraft(true);
  const withoutTerraform = createDraft(false);
  const target = createTarget(createBuildConfig());

  assert.equal(await resolveScope(withTerraform, target, "auto"), "full_stack");
  assert.equal(await resolveScope(withoutTerraform, target, "auto"), "application");
  assert.equal(await resolveScope(withTerraform, createTarget(null), "infrastructure"), "infrastructure");
});

test("does not silently downgrade an ECS/Fargate auto deployment when build config is missing", async () => {
  await assert.rejects(
    resolveScope(createDraft(true, true), createTarget(null), "auto"),
    (error: unknown) =>
      error instanceof DeploymentConflictError &&
      error.message === "A confirmed project deployment target is required for automatic ECS application deployment"
  );
  await assert.rejects(
    resolveScope(createDraft(true, true), undefined, "auto"),
    /confirmed project deployment target/
  );
});

async function resolveScope(
  draft: DeploymentPreparationDraft,
  target: DeploymentPreparationTarget | undefined,
  requestedScope: "auto" | "infrastructure"
) {
  const repository: DeploymentPreparationRepository = {
    async findProjectDraftForPreparation() {
      return draft;
    },
    async findProjectTargetForPreparation() {
      return target;
    }
  };
  return (
    await resolveDeploymentPreparation(
      {
        projectId: "project-1",
        awsConnectionId: "connection-1",
        draftRevision: 1,
        requestedScope
      },
      repository
    )
  ).scope;
}

function createDraft(hasTerraform: boolean, includeEcs = false): DeploymentPreparationDraft {
  return {
    revision: 1,
    diagramJson: includeEcs
      ? {
          ...diagramJson,
          nodes: [
            {
              id: "ecs-service",
              kind: "resource",
              type: "ECS_SERVICE",
              label: "ECS Service",
              position: { x: 0, y: 0 },
              size: { width: 200, height: 120 },
              locked: false,
              zIndex: 0,
              parameters: {
                resourceType: "ECS_SERVICE",
                resourceName: "app",
                fileName: "main.tf",
                values: {}
              }
            }
          ]
        }
      : diagramJson,
    terraformFiles: hasTerraform
      ? [{ fileName: "main.tf", terraformCode: 'resource "aws_ecs_service" "app" {}' }]
      : []
  };
}

function createTarget(
  confirmedBuildConfig: ConfirmedBuildConfig | null
): DeploymentPreparationTarget {
  return {
    connectionId: "connection-1",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig
  };
}

function createBuildConfig(): ConfirmedBuildConfig {
  return {
    sourceRoot: ".",
    evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
    installPreset: "none",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "Dockerfile",
    packageManifestPath: null,
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "a".repeat(40),
    confirmedAt: "2026-07-17T00:00:00.000Z"
  };
}
