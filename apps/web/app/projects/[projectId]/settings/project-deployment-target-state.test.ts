import assert from "node:assert/strict";
import { test } from "node:test";
import type { AwsConnection, ProjectDeploymentTarget } from "@sketchcatch/types";
import {
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  formatDeploymentTargetUpdatedAt,
  isDeploymentTargetDraftReady
} from "./project-deployment-target-state.js";

const connection = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
  externalId: "masked",
  region: "ap-northeast-2",
  status: "verified",
  lastVerifiedAt: "2026-07-14T00:00:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z"
} satisfies AwsConnection;

test("deployment target draft maps each runtime to a structured build preset", () => {
  const cases = [
    ["ecs_fargate", "docker_build", "dockerfile", "Dockerfile"],
    ["lambda", "sam_build", "sam_template", "template.yaml"],
    ["ec2_asg", "codedeploy_bundle", "appspec", "appspec.yml"],
    ["static_site", "static_export", "static_output", "dist"]
  ] as const;

  for (const [runtimeTargetKind, buildPreset, evidenceKind, evidencePath] of cases) {
    const draft = createDeploymentTargetDraft(null, [connection]);
    const request = createDeploymentTargetRequest(
      { ...draft, runtimeTargetKind, evidencePath, commitSha: "a".repeat(40) },
      [connection],
      new Date("2026-07-14T00:00:00.000Z")
    );

    assert.equal(request.runtimeTargetKind, runtimeTargetKind);
    assert.equal(request.confirmedBuildConfig?.buildPreset, buildPreset);
    assert.equal(request.confirmedBuildConfig?.evidence[0]?.kind, evidenceKind);
  }
});

test("deployment target draft restores the persisted project target", () => {
  const target = {
    projectId: "33333333-3333-4333-8333-333333333333",
    provider: "aws",
    connectionId: connection.id,
    region: connection.region,
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: "apps/api",
      evidence: [{ kind: "dockerfile", path: "apps/api/Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/ready",
      dockerfilePath: "apps/api/Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: "1.2.0",
      confirmedCommitSha: "b".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    rolloutStrategy: "all_at_once",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  } satisfies ProjectDeploymentTarget;

  const draft = createDeploymentTargetDraft(target, [connection]);

  assert.equal(draft.sourceRoot, "apps/api");
  assert.equal(draft.evidencePath, "apps/api/Dockerfile");
  assert.equal(draft.healthCheckPath, "/ready");
  assert.equal(draft.version, "1.2.0");
});

test("target save requires a verified connection and canonical commit SHA", () => {
  const draft = createDeploymentTargetDraft(null, [connection]);

  assert.equal(isDeploymentTargetDraftReady(draft, [connection]), false);
  assert.equal(
    isDeploymentTargetDraftReady({ ...draft, commitSha: "a".repeat(40) }, [connection]),
    true
  );
  assert.equal(
    isDeploymentTargetDraftReady({ ...draft, commitSha: "a".repeat(40) }, [
      { ...connection, status: "failed" }
    ]),
    false
  );
});

test("deployment target timestamps use an explicit Seoul timezone", () => {
  assert.match(
    formatDeploymentTargetUpdatedAt("2026-07-14T00:00:00.000Z"),
    /2026.*7.*14.*9:00:00/
  );
});
