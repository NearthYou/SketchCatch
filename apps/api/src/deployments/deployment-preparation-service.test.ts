import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";
import {
  createPreparedDraftSnapshotHash,
  getDeploymentConsolePhase,
  resolveDeploymentPreparation,
  type DeploymentPreparationRepository
} from "./deployment-preparation-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const diagramJson: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};
const terraformFiles: TerraformSyncFileInput[] = [
  { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }
];

test("prepare rejects a stale or missing saved draft revision before Deployment creation", async () => {
  const repository = new FakePreparationRepository();

  await assert.rejects(
    resolveDeploymentPreparation(
      { projectId, awsConnectionId: connectionId, draftRevision: 6, requestedScope: "auto" },
      repository
    ),
    /stale/i
  );
  repository.draft = undefined;
  await assert.rejects(
    resolveDeploymentPreparation(
      { projectId, awsConnectionId: connectionId, draftRevision: 7, requestedScope: "auto" },
      repository
    ),
    /saved draft/i
  );
});

test("prepare detects full_stack from Terraform and a confirmed project runtime target", async () => {
  const repository = new FakePreparationRepository();

  const result = await resolveDeploymentPreparation(
    { projectId, awsConnectionId: connectionId, draftRevision: 7, requestedScope: "auto" },
    repository
  );

  assert.equal(result.scope, "full_stack");
  assert.equal(result.targetKind, "ecs_fargate");
  assert.equal(result.preparedDraftRevision, 7);
  assert.match(result.preparedSnapshotHash, /^[a-f0-9]{64}$/);
});

test("explicit application scope requires the confirmed target connection", async () => {
  const repository = new FakePreparationRepository();

  await assert.rejects(
    resolveDeploymentPreparation(
      {
        projectId,
        awsConnectionId: "33333333-3333-4333-8333-333333333333",
        draftRevision: 7,
        requestedScope: "application"
      },
      repository
    ),
    /connection/i
  );
});

test("prepared draft hash is stable across object key order", () => {
  const first = createPreparedDraftSnapshotHash({ revision: 7, diagramJson, terraformFiles });
  const second = createPreparedDraftSnapshotHash({
    terraformFiles,
    diagramJson: { viewport: diagramJson.viewport, edges: [], nodes: [] },
    revision: 7
  });

  assert.equal(first, second);
});

test("console phase normalizes internal save, plan, approval, apply, and destroy states", () => {
  assert.equal(
    getDeploymentConsolePhase({ status: "PENDING", currentPlanArtifactId: null, approvedAt: null }),
    "validation"
  );
  assert.equal(
    getDeploymentConsolePhase({ status: "PENDING", currentPlanArtifactId: "plan-1", approvedAt: null }),
    "approval"
  );
  assert.equal(
    getDeploymentConsolePhase({
      status: "PENDING",
      currentPlanArtifactId: "plan-1",
      approvedAt: new Date("2026-07-14T00:00:00.000Z")
    }),
    "deployment"
  );
  assert.equal(
    getDeploymentConsolePhase({ status: "SUCCESS", currentPlanArtifactId: "destroy-1", approvedAt: null }),
    "deployment"
  );
});

class FakePreparationRepository implements DeploymentPreparationRepository {
  draft: Awaited<ReturnType<DeploymentPreparationRepository["findProjectDraftForPreparation"]>> = {
    revision: 7,
    diagramJson,
    terraformFiles
  };
  target: Awaited<ReturnType<DeploymentPreparationRepository["findProjectTargetForPreparation"]>> = {
    connectionId,
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
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
      manifestVersion: "1.0.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    }
  };

  async findProjectDraftForPreparation() {
    return this.draft ?? undefined;
  }

  async findProjectTargetForPreparation() {
    return this.target ?? undefined;
  }
}
