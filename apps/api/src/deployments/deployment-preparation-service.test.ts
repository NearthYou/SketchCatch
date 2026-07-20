import assert from "node:assert/strict";
import test from "node:test";
import type { ConfirmedBuildConfig, DiagramJson } from "@sketchcatch/types";
import {
  assertDraftTerraformDoesNotIncludeAnalysisExcludedResource,
  createDeploymentPreparationKey,
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

test("preparation idempotency follows saved content rather than generated artifact ids", () => {
  const input = {
    awsConnectionId: "connection-1",
    deploymentTargetFingerprint: "c".repeat(64),
    preparedDraftRevision: 7,
    preparedSnapshotHash: "a".repeat(64),
    projectId: "project-1",
    scope: "full_stack" as const,
    targetKind: "ecs_fargate" as const
  };

  assert.equal(createDeploymentPreparationKey(input), createDeploymentPreparationKey({ ...input }));
  assert.notEqual(
    createDeploymentPreparationKey(input),
    createDeploymentPreparationKey({ ...input, preparedSnapshotHash: "b".repeat(64) })
  );
  assert.notEqual(
    createDeploymentPreparationKey(input),
    createDeploymentPreparationKey({ ...input, deploymentTargetFingerprint: "d".repeat(64) })
  );
});

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
  assert.equal(
    await resolveScope(withTerraform, createTarget(null), "infrastructure"),
    "infrastructure"
  );
});

test("uses the ECS web-service profile for a basic infrastructure draft", async () => {
  const repository: DeploymentPreparationRepository = {
    async findProjectDraftForPreparation() {
      return createDraft(true);
    },
    async findProjectTargetForPreparation() {
      return createTarget(null);
    }
  };

  const preparation = await resolveDeploymentPreparation(
    {
      projectId: "project-1",
      awsConnectionId: "connection-1",
      draftRevision: 1,
      requestedScope: "infrastructure"
    },
    repository
  );

  assert.equal(preparation.liveProfile, "demo_web_service");
});

test("does not silently downgrade an ECS/Fargate auto deployment when build config is missing", async () => {
  await assert.rejects(
    resolveScope(createDraft(true, true), createTarget(null), "auto"),
    (error: unknown) =>
      error instanceof DeploymentConflictError &&
      error.message ===
        "A confirmed project deployment target is required for automatic ECS application deployment"
  );
  await assert.rejects(
    resolveScope(createDraft(true, true), undefined, "auto"),
    /confirmed project deployment target/
  );
});

test("rejects full-stack preparation when a required runtime Secret is absent from Terraform", async () => {
  const buildConfig = createBuildConfigWithRequiredSecret();

  await assert.rejects(
    resolveScope(createDraft(true, true), createTarget(buildConfig), "auto"),
    (error: unknown) =>
      error instanceof DeploymentConflictError &&
      error.message.includes("CHECK_IN_SIGNING_SECRET") &&
      error.message.includes("Terraform")
  );
});

test("accepts the rendered Fixed Template runtime Secret contract before full-stack deployment", async () => {
  const draft = createDraftWithRuntimeSecretTerraform();

  assert.equal(
    await resolveScope(draft, createTarget(createBuildConfigWithRequiredSecret()), "auto"),
    "full_stack"
  );
});

test("rejects a runtime Secret contract whose IAM policy references a different Secret", async () => {
  const draft = createDraftWithRuntimeSecretTerraform();
  draft.terraformFiles =
    draft.terraformFiles?.map((file) => ({
      ...file,
      terraformCode: file.terraformCode.replace(
        "aws_secretsmanager_secret.check_in_signing.arn",
        "aws_secretsmanager_secret.unrelated.arn"
      )
    })) ?? [];

  await assert.rejects(
    resolveScope(draft, createTarget(createBuildConfigWithRequiredSecret()), "auto"),
    /runtime Secret mapping is incomplete/
  );
});

test("rejects a runtime Secret policy attached to a different role than the ECS Task execution role", async () => {
  const draft = createDraftWithRuntimeSecretTerraform();
  draft.terraformFiles = draft.terraformFiles?.map((file) => ({
    ...file,
    terraformCode: `${file.terraformCode.replace(
      "role   = aws_iam_role.execution.id",
      "role   = aws_iam_role.unrelated.id"
    )}\nresource "aws_iam_role" "unrelated" {}`
  })) ?? [];

  await assert.rejects(
    resolveScope(draft, createTarget(createBuildConfigWithRequiredSecret()), "auto"),
    /runtime Secret mapping is incomplete/
  );
});

test("rejects a runtime Secret Task Definition that the ECS Service does not use", async () => {
  const draft = createDraftWithRuntimeSecretTerraform();
  draft.terraformFiles = draft.terraformFiles?.map((file) => ({
    ...file,
    terraformCode: `${file.terraformCode.replace(
      "task_definition = aws_ecs_task_definition.task.arn",
      "task_definition = aws_ecs_task_definition.unrelated.arn"
    )}\nresource "aws_ecs_task_definition" "unrelated" {}`
  })) ?? [];

  await assert.rejects(
    resolveScope(draft, createTarget(createBuildConfigWithRequiredSecret()), "auto"),
    /runtime Secret mapping is incomplete/
  );
});

test("rejects runtime Secret references split across different Secret Version blocks", async () => {
  const draft = createDraftWithRuntimeSecretTerraform();
  draft.terraformFiles = draft.terraformFiles?.map((file) => ({
    ...file,
    terraformCode: `${file.terraformCode.replace(
      "secret_string = random_password.check_in_signing.result",
      'secret_string = "not-generated"'
    )}
resource "aws_secretsmanager_secret" "unrelated" {}
resource "aws_secretsmanager_secret_version" "unrelated" {
  secret_id     = aws_secretsmanager_secret.unrelated.id
  secret_string = random_password.check_in_signing.result
}`
  })) ?? [];

  await assert.rejects(
    resolveScope(draft, createTarget(createBuildConfigWithRequiredSecret()), "auto"),
    /runtime Secret mapping is incomplete/
  );
});

function createDraftWithRuntimeSecretTerraform(): DeploymentPreparationDraft {
  const draft = createDraft(true, true);
  draft.terraformFiles = [
    {
      fileName: "main.tf",
      terraformCode: `resource "random_password" "check_in_signing" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "check_in_signing" {}
resource "aws_secretsmanager_secret_version" "check_in_signing" {
  secret_id     = aws_secretsmanager_secret.check_in_signing.id
  secret_string = random_password.check_in_signing.result
}
resource "aws_iam_role" "execution" {}
resource "aws_iam_role_policy" "check_in_signing_read" {
  name   = "runtime-secret-read"
  role   = aws_iam_role.execution.id
  policy = "{\\"Version\\":\\"2012-10-17\\",\\"Statement\\":[{\\"Sid\\":\\"ReadCheckInSigningSecret\\",\\"Effect\\":\\"Allow\\",\\"Action\\":[\\"secretsmanager:GetSecretValue\\"],\\"Resource\\":\\"\${aws_secretsmanager_secret.check_in_signing.arn}\\"}]}"
}
resource "aws_ecs_task_definition" "task" {
  execution_role_arn    = aws_iam_role.execution.arn
  container_definitions = "[{\\"name\\":\\"web\\",\\"secrets\\":[{\\"name\\":\\"CHECK_IN_SIGNING_SECRET\\",\\"valueFrom\\":\\"\${aws_secretsmanager_secret.check_in_signing.arn}\\"}]}]"
}
resource "aws_ecs_service" "app" {
  task_definition = aws_ecs_task_definition.task.arn
}`
    }
  ];
  return draft;
}

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
    confirmedBuildConfig,
    deploymentTargetFingerprint: "c".repeat(64)
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

function createBuildConfigWithRequiredSecret(): ConfirmedBuildConfig {
  return {
    ...createBuildConfig(),
    ecsWeb: {
      api: {
        sourceRoot: ".",
        dockerfilePath: "Dockerfile",
        containerPort: 4000,
        healthCheckPath: "/health",
        requiredRuntimeSecrets: ["CHECK_IN_SIGNING_SECRET"]
      },
      frontend: {
        sourceRoot: "web",
        packageManifestPath: "web/package.json",
        lockfilePath: "package-lock.json",
        packageManager: "npm",
        packageManagerVersion: "10.9.2",
        installPreset: "npm_ci",
        buildPreset: "npm_build",
        outputPath: "web/dist"
      }
    }
  };
}
