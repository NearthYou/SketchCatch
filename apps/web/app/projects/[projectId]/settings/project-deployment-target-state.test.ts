import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AwsConnection,
  ProjectDeploymentTarget,
  SourceRepository
} from "@sketchcatch/types";
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
      {
        ...draft,
        runtimeTargetKind,
        evidencePath,
        commitSha: "a".repeat(40),
        ...(runtimeTargetKind === "ecs_fargate" ? createEcsCoordinates() : {})
      },
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
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "sketchcatch-api-build",
      ecrRepositoryName: "sketchcatch/api",
      clusterName: "sketchcatch-api",
      serviceName: "sketchcatch-api",
      containerName: "api",
      outputUrl: "https://api.example.com"
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
  assert.equal(draft.codeBuildProjectName, "sketchcatch-api-build");
  assert.equal(draft.outputUrl, "https://api.example.com");
});

test("one current Dockerfile is suggested from repository evidence without auto-confirming it", () => {
  const repository = createSourceRepository({
    analysis: {
      repositoryRevision: "c".repeat(40),
      analyzedAt: "2026-07-14T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "ecs-fargate-container-app",
        applicationUnits: [
          {
            id: "api",
            rootPath: "apps/api",
            kind: "backend",
            frameworks: ["fastify"],
            evidencePaths: ["apps/api/Dockerfile"]
          }
        ],
        evidence: [
          {
            kind: "dockerfile",
            path: "apps/api/Dockerfile",
            applicationUnitId: "api",
            signals: []
          }
        ],
        missingEvidence: [],
        selectionReasons: ["Dockerfile detected"]
      }
    }
  });

  const draft = createDeploymentTargetDraft(null, [connection], repository);

  assert.equal(draft.sourceRoot, "apps/api");
  assert.equal(draft.evidencePath, "apps/api/Dockerfile");
  assert.equal(draft.commitSha, "c".repeat(40));
  assert.equal(draft.evidenceSuggested, true);
  assert.equal(isDeploymentTargetDraftReady(draft, [connection]), false);
});

test("ambiguous Dockerfile evidence is not suggested", () => {
  const repository = createSourceRepository({
    analysis: {
      repositoryRevision: "c".repeat(40),
      analyzedAt: "2026-07-14T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "ecs-fargate-container-app",
        applicationUnits: [],
        evidence: [
          { kind: "dockerfile", path: "apps/api/Dockerfile", applicationUnitId: null, signals: [] },
          { kind: "dockerfile", path: "apps/web/Dockerfile", applicationUnitId: null, signals: [] }
        ],
        missingEvidence: [],
        selectionReasons: ["Dockerfiles detected"]
      }
    }
  });

  const draft = createDeploymentTargetDraft(null, [connection], repository);

  assert.equal(draft.evidencePath, "Dockerfile");
  assert.equal(draft.commitSha, "");
  assert.equal(draft.evidenceSuggested, false);
});

test("malformed repository analysis fails closed without crashing settings", () => {
  const repository = createSourceRepository({
    analysis: {
      repositoryRevision: "c".repeat(40),
      analyzedAt: "2026-07-14T00:00:00.000Z",
      aiHandoff: null
    }
  } as unknown as Partial<SourceRepository>);

  const draft = createDeploymentTargetDraft(null, [connection], repository);

  assert.equal(draft.evidenceSuggested, false);
  assert.equal(draft.commitSha, "");
});

test("target save requires verified build evidence and complete ECS coordinates", () => {
  const draft = createDeploymentTargetDraft(null, [connection]);

  assert.equal(isDeploymentTargetDraftReady(draft, [connection]), false);
  assert.equal(
    isDeploymentTargetDraftReady(
      { ...draft, commitSha: "a".repeat(40), ...createEcsCoordinates() },
      [connection]
    ),
    true
  );
  assert.equal(
    isDeploymentTargetDraftReady({ ...draft, commitSha: "a".repeat(40), ...createEcsCoordinates() }, [
      { ...connection, status: "failed" }
    ]),
    false
  );
});

function createEcsCoordinates() {
  return {
    codeBuildProjectName: "sketchcatch-api-build",
    ecrRepositoryName: "sketchcatch/api",
    clusterName: "sketchcatch-api",
    serviceName: "sketchcatch-api",
    containerName: "api",
    outputUrl: "https://api.example.com"
  };
}

function createSourceRepository(overrides: Partial<SourceRepository> = {}): SourceRepository {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "33333333-3333-4333-8333-333333333333",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1",
    owner: "NearthYou",
    name: "api",
    defaultBranch: "dev",
    repositoryUrl: "https://github.com/NearthYou/api",
    visibility: "private",
    archived: false,
    analysis: null,
    disconnectedAt: null,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides
  };
}

test("deployment target timestamps use an explicit Seoul timezone", () => {
  assert.match(
    formatDeploymentTargetUpdatedAt("2026-07-14T00:00:00.000Z"),
    /2026.*7.*14.*9:00:00/
  );
});
