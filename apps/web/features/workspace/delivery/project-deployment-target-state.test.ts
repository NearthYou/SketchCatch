import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  changeDeploymentTargetRuntime,
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  createEcsFargateDeploymentDefaults,
  getDeploymentTargetOutputUrlSummary,
  getLockedSystemFields,
  getLockedSystemFieldsAfterRuntimeChange,
  getMissingDeploymentTargetFieldKeys,
  isDeploymentTargetDraftReady
} from "./project-deployment-target-state.js";

const verifiedConnection = {
  id: "abcdef12-3456-4789-8abc-def012345678",
  userId: "user-1",
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
  externalId: "external-id",
  region: "ap-northeast-2",
  status: "verified" as const,
  lastVerifiedAt: "2026-07-15T00:00:00.000Z",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

const editorSource = readFileSync(
  new URL("./ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);
const advancedSettingsSource = readFileSync(
  new URL("./ProjectDeploymentTargetAdvancedSettings.tsx", import.meta.url),
  "utf8"
);
const editorStyles = readFileSync(
  new URL("./project-deployment-target-editor.module.css", import.meta.url),
  "utf8"
);

test("shared editor preserves optional ECS web build defaults", () => {
  assert.match(editorSource, /const ecsDefaultsEcsWeb = ecsDefaults\?\.ecsWeb;/);
  assert.match(editorSource, /ecsWeb: ecsDefaultsEcsWeb/);
});

test("editor keeps required decisions visible and moves inferred values behind advanced disclosure", () => {
  const advancedSettingsIndex = editorSource.indexOf("<ProjectDeploymentTargetAdvancedSettings");
  assert.ok(advancedSettingsIndex > 0);
  assert.ok(editorSource.indexOf("AWS 연결 <em>필수</em>") < advancedSettingsIndex);
  assert.ok(editorSource.indexOf("실행 방식 <em>필수</em>") < advancedSettingsIndex);
  assert.ok(editorSource.indexOf("자동 설정 결과") < advancedSettingsIndex);
  assert.match(advancedSettingsSource, /<details className=\{styles\.advancedSettings\}>/);
  assert.match(advancedSettingsSource, /<span>Source root<\/span>/);
  assert.match(advancedSettingsSource, /readOnly=\{lockedSystemFields\.has\("commitSha"\)\}/);
  assert.match(
    editorSource,
    /getLockedSystemFieldsAfterRuntimeChange\(current, nextDraft\.commitSha\)/
  );
  assert.match(advancedSettingsSource, /Output URL/);
  assert.match(advancedSettingsSource, /readOnly=\{draft\.runtimeTargetKind === "ecs_fargate"\}/);
  assert.doesNotMatch(
    advancedSettingsSource,
    /<details className=\{styles\.advancedSettings\} open/
  );
});

test("editor renders only the selected Runtime section and stacks fields on small screens", () => {
  for (const runtime of ["ecs_fargate", "lambda", "ec2_asg", "static_site"]) {
    assert.match(advancedSettingsSource, new RegExp(`${runtime}: \\[`));
  }
  assert.match(editorStyles, /@media \(max-width: 720px\)/);
  assert.match(editorStyles, /grid-template-columns: 1fr/);
  assert.match(editorStyles, /input\[readonly\]/);
});

test("typing a missing system value stays editable until a successful save locks it", () => {
  const updateDraftSource = editorSource.slice(
    editorSource.indexOf("function updateDraft"),
    editorSource.indexOf("function changeRuntime")
  );
  const saveTargetStart = editorSource.indexOf("async function saveTarget");
  const saveTargetSource = editorSource.slice(
    saveTargetStart,
    editorSource.indexOf("useImperativeHandle(ref", saveTargetStart)
  );

  assert.doesNotMatch(updateDraftSource, /setLockedSystemFields/);
  assert.match(
    saveTargetSource,
    /setLockedSystemFields\(getLockedSystemFields\(savedDraft, saved\)\)/
  );
});

test("ECS defaults use project slug and analyzed Dockerfile evidence", () => {
  assert.deepEqual(
    createEcsFargateDeploymentDefaults({
      projectName: "Audience Live Check",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile"
    }),
    {
      runtimeTargetKind: "ecs_fargate",
      sourceRoot: "apps/api",
      evidencePath: "apps/api/Dockerfile",
      commitSha: "a".repeat(40),
      codeBuildProjectName: "audience-live-check-app-build",
      ecrRepositoryName: "audience-live-check-app",
      clusterName: "audience-live-check-cluster",
      serviceName: "audience-live-check-service",
      containerName: "web",
      healthCheckPath: "/",
      outputUrl: "",
      ecsWeb: null
    }
  );
});

test("a new target auto-selects an AWS connection only when exactly one is verified", () => {
  const secondConnection = {
    ...verifiedConnection,
    id: "abcdef12-3456-4789-8abc-def012345679",
    accountId: "210987654321"
  };

  assert.equal(
    createDeploymentTargetDraft(null, [verifiedConnection]).connectionId,
    verifiedConnection.id
  );
  assert.equal(
    createDeploymentTargetDraft(null, [verifiedConnection, secondConnection]).connectionId,
    ""
  );
});

test("Architecture selects the initial Runtime without inventing missing build evidence", () => {
  const cases = [
    ["aws_lambda_function", "lambda"],
    ["aws_autoscaling_group", "ec2_asg"],
    ["aws_cloudfront_distribution", "static_site"]
  ] as const;

  for (const [resourceType, runtimeTargetKind] of cases) {
    const draft = createDeploymentTargetDraft(
      null,
      [verifiedConnection],
      null,
      null,
      "preserve_target",
      {
        nodes: [deploymentNode(resourceType, {})],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    );

    assert.equal(draft.runtimeTargetKind, runtimeTargetKind);
    assert.equal(draft.evidencePath, "");
    assert.equal(isDeploymentTargetDraftReady(draft, [verifiedConnection]), false);
  }
});

test("inferred system values stay editable while confirmed SHA remains locked across Runtime changes", () => {
  const draft = createDeploymentTargetDraft(null, [verifiedConnection], null, {
    projectName: "Lock Scope",
    repositoryRevision: "a".repeat(40),
    sourceRoot: ".",
    dockerfilePath: "Dockerfile"
  });
  const inferredLocks = getLockedSystemFields(draft, null);

  assert.equal(inferredLocks.has("commitSha"), true);
  assert.equal(inferredLocks.has("clusterName"), false);
  assert.deepEqual(
    [
      ...getLockedSystemFieldsAfterRuntimeChange(
        new Set(["commitSha", "clusterName"]),
        "a".repeat(40)
      )
    ],
    ["commitSha"]
  );
  assert.deepEqual(
    [...getLockedSystemFieldsAfterRuntimeChange(new Set(["commitSha"]), "")],
    []
  );
});

test("output URL summary distinguishes automatic ECS output from required external URLs", () => {
  assert.equal(
    getDeploymentTargetOutputUrlSummary({ runtimeTargetKind: "ecs_fargate", outputUrl: "" }),
    "첫 배포 후 자동 입력"
  );
  assert.equal(
    getDeploymentTargetOutputUrlSummary({ runtimeTargetKind: "lambda", outputUrl: "" }),
    "저장 전 입력 필요"
  );
  assert.equal(
    getDeploymentTargetOutputUrlSummary({
      runtimeTargetKind: "static_site",
      outputUrl: "https://example.com"
    }),
    "https://example.com"
  );
});

test("editor blocks both required decisions while deployment target data is loading", () => {
  const runtimeSelectStart = editorSource.indexOf("실행 방식 <em>필수</em>");
  const runtimeSelectEnd = editorSource.indexOf("</select>", runtimeSelectStart);
  const runtimeSelectSource = editorSource.slice(runtimeSelectStart, runtimeSelectEnd);

  assert.match(
    runtimeSelectSource,
    /disabled=\{requestState === "loading" \|\| requestState === "saving"\}/
  );
  assert.match(editorSource, /배포 타깃 정보를 불러오는 중입니다\./);
});

test("ECS defaults are immediately saveable without a fabricated output URL", () => {
  const draft = createDeploymentTargetDraft(null, [verifiedConnection], null, {
    projectName: "Audience Live Check",
    repositoryRevision: "a".repeat(40),
    sourceRoot: ".",
    dockerfilePath: "apps/api/Dockerfile",
    ecsWeb: {
      api: {
        sourceRoot: ".",
        dockerfilePath: "apps/api/Dockerfile",
        containerPort: 8080,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "package-lock.json",
        packageManager: "npm",
        packageManagerVersion: "10.9.2",
        installPreset: "npm_ci",
        buildPreset: "npm_build",
        outputPath: "apps/web/dist"
      }
    }
  });
  const request = createDeploymentTargetRequest(
    draft,
    [verifiedConnection],
    new Date("2026-07-15T00:00:00.000Z")
  );

  assert.equal(request.runtimeConfig?.runtimeTargetKind, "ecs_fargate");
  if (request.runtimeConfig?.runtimeTargetKind === "ecs_fargate") {
    assert.equal(request.runtimeConfig.codeBuildProjectName, "audience-live-check-api-build");
    assert.equal(request.runtimeConfig.ecrRepositoryName, "audience-live-check-api");
    assert.equal(request.runtimeConfig.clusterName, "audience-live-check-cluster");
    assert.equal(request.runtimeConfig.serviceName, "audience-live-check-service");
    assert.equal(request.runtimeConfig.containerName, "api");
  }
  assert.equal(request.runtimeConfig?.outputUrl, null);
  assert.equal(request.confirmedBuildConfig.healthCheckPath, "/health");
  assert.deepEqual(request.confirmedBuildConfig.ecsWeb, {
    api: {
      sourceRoot: ".",
      dockerfilePath: "apps/api/Dockerfile",
      containerPort: 8080,
      healthCheckPath: "/health"
    },
    frontend: {
      sourceRoot: "apps/web",
      packageManifestPath: "apps/web/package.json",
      lockfilePath: "package-lock.json",
      packageManager: "npm",
      packageManagerVersion: "10.9.2",
      installPreset: "npm_ci",
      buildPreset: "npm_build",
      outputPath: "apps/web/dist"
    }
  });
});

test("Runtime validation reports only the selected Runtime's missing fields", () => {
  const ecsDraft = createDeploymentTargetDraft(null, [verifiedConnection], null, {
    projectName: "Runtime Switch",
    repositoryRevision: "a".repeat(40),
    sourceRoot: ".",
    dockerfilePath: "Dockerfile"
  });
  const lambdaDraft = {
    ...changeDeploymentTargetRuntime(ecsDraft, "lambda"),
    commitSha: "b".repeat(40),
    evidencePath: "template.yaml",
    functionLogicalId: "ApiFunction",
    functionName: "runtime-switch-api",
    aliasName: "live",
    codeDeployApplicationName: "runtime-switch",
    codeDeployDeploymentGroupName: "runtime-switch-live"
  };

  assert.deepEqual(getMissingDeploymentTargetFieldKeys(lambdaDraft, [verifiedConnection]), [
    "output_url"
  ]);
  assert.equal(isDeploymentTargetDraftReady(lambdaDraft, [verifiedConnection]), false);
  assert.doesNotMatch(
    getMissingDeploymentTargetFieldKeys(lambdaDraft, [verifiedConnection]).join(","),
    /ecr|cluster|service|container/
  );
});

test("public Repository Analysis Record seeds a target before GitHub Source Repository connection", () => {
  const repositoryRevision = "e".repeat(40);
  const draft = createDeploymentTargetDraft(
    null,
    [verifiedConnection],
    null,
    null,
    "preserve_target",
    null,
    {
      id: "analysis-record-1",
      projectId: "project-1",
      provider: "github",
      repositoryUrl: "https://github.com/sketchcatch/example-api",
      owner: "sketchcatch",
      name: "example-api",
      branch: "main",
      repositoryRevision,
      analysisResult: {
        repositoryUrl: "https://github.com/sketchcatch/example-api",
        repositoryRevision,
        defaultBranch: "main",
        availableBranches: ["main"],
        evidenceFiles: [{ path: "services/api/Dockerfile", found: true }],
        detectedSignals: ["Dockerfile"],
        recommendedTemplateId: "ecs-fargate-container-app",
        recommendationReason: "Container evidence",
        aiHandoff: {
          status: "template_selected",
          templateId: "ecs-fargate-container-app",
          selectionReasons: ["Container evidence"],
          applicationUnits: [
            {
              id: "api",
              rootPath: "services/api",
              kind: "backend",
              frameworks: ["express"],
              evidencePaths: ["services/api/Dockerfile"]
            }
          ],
          evidence: [
            {
              kind: "dockerfile",
              path: "services/api/Dockerfile",
              applicationUnitId: "api",
              signals: []
            }
          ],
          missingEvidence: []
        }
      },
      selectedTemplateId: "ecs-fargate-container-app",
      sourceRepositoryId: null,
      analyzedAt: "2026-07-17T00:00:00.000Z",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z"
    }
  );

  assert.equal(draft.sourceRoot, "services/api");
  assert.equal(draft.evidencePath, "services/api/Dockerfile");
  assert.equal(draft.commitSha, repositoryRevision);
  assert.equal(draft.ecrRepositoryName, "example-api-app");
});

test("web-inclusive ECS Architecture derives the frontend build snapshot from Repository evidence", () => {
  const repositoryRevision = "d".repeat(40);
  const sourceRepository = {
    id: "source-repository-1",
    projectId: "project-1",
    provider: "github" as const,
    status: "active" as const,
    githubInstallationId: "123",
    githubRepositoryId: "456",
    owner: "jh-9999",
    name: "audience-live-check",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/jh-9999/audience-live-check",
    visibility: "public" as const,
    archived: false,
    analysis: {
      repositoryRevision,
      analyzedAt: "2026-07-15T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected" as const,
        templateId: "ecs-fargate-container-app" as const,
        selectionReasons: ["Container API and Vite frontend"],
        applicationUnits: [
          {
            id: "api",
            rootPath: "apps/api",
            kind: "backend" as const,
            frameworks: ["Express"],
            evidencePaths: ["apps/api/Dockerfile", "apps/api/package.json"]
          },
          {
            id: "web",
            rootPath: "apps/web",
            kind: "frontend" as const,
            frameworks: ["React", "Vite"],
            evidencePaths: ["apps/web/package.json"]
          }
        ],
        evidence: [
          {
            kind: "package_json" as const,
            path: "package.json",
            applicationUnitId: null,
            signals: []
          },
          {
            kind: "lockfile" as const,
            path: "package-lock.json",
            applicationUnitId: null,
            signals: []
          },
          {
            kind: "dockerfile" as const,
            path: "apps/api/Dockerfile",
            applicationUnitId: "api",
            signals: []
          },
          {
            kind: "package_json" as const,
            path: "apps/web/package.json",
            applicationUnitId: "web",
            signals: ["React", "Vite"]
          },
          {
            kind: "static_output" as const,
            path: "apps/web/dist",
            applicationUnitId: "web",
            signals: ["Vite static build output"]
          }
        ],
        architectureFacts: [],
        missingEvidence: []
      }
    },
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
  const diagramJson = {
    nodes: [
      deploymentNode("aws_s3_bucket", { bucketPrefix: "audience-web" }),
      deploymentNode("aws_cloudfront_distribution", { enabled: true }),
      deploymentNode("aws_ecr_repository", { name: "audience-live-check-api" }),
      deploymentNode("aws_ecs_cluster", { name: "audience-live-check-cluster" }),
      deploymentNode("aws_ecs_service", {
        name: "audience-live-check-service",
        loadBalancer: { containerName: "api" }
      }),
      deploymentNode("aws_lb_target_group", { healthCheck: { path: "/health" } })
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const draft = createDeploymentTargetDraft(
    null,
    [verifiedConnection],
    sourceRepository,
    null,
    "preserve_target",
    diagramJson
  );
  const request = createDeploymentTargetRequest(
    draft,
    [verifiedConnection],
    new Date("2026-07-15T00:00:00.000Z")
  );

  assert.equal(draft.sourceRoot, ".");
  assert.equal(draft.healthCheckPath, "/health");
  assert.equal(request.confirmedBuildConfig.ecsWeb?.frontend.packageManager, "npm");
  assert.equal(request.confirmedBuildConfig.ecsWeb?.frontend.outputPath, "apps/web/dist");
});

test("empty ECS settings use Source Repository evidence and current Architecture defaults", () => {
  const repositoryRevision = "b".repeat(40);
  const draft = createDeploymentTargetDraft(
    null,
    [verifiedConnection],
    {
      id: "source-repository-1",
      projectId: "project-1",
      provider: "github",
      status: "active",
      githubInstallationId: "123",
      githubRepositoryId: "456",
      owner: "whiskend",
      name: "audience-live-check",
      defaultBranch: "main",
      repositoryUrl: "https://github.com/whiskend/audience-live-check",
      visibility: "public",
      archived: false,
      analysis: {
        repositoryRevision,
        analyzedAt: "2026-07-15T00:00:00.000Z",
        aiHandoff: {
          status: "template_selected",
          templateId: "ecs-fargate-container-app",
          selectionReasons: ["A Dockerized API is present."],
          applicationUnits: [
            {
              id: "api",
              rootPath: "apps/api",
              kind: "backend",
              frameworks: ["express"],
              evidencePaths: ["apps/api/Dockerfile"]
            }
          ],
          evidence: [
            {
              kind: "dockerfile",
              path: "apps/api/Dockerfile",
              applicationUnitId: "api",
              signals: ["EXPOSE 8080"]
            }
          ],
          architectureFacts: [],
          missingEvidence: []
        }
      },
      disconnectedAt: null,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    null,
    "preserve_target",
    {
      nodes: [
        deploymentNode("aws_ecr_repository", { name: "audience-live-check-api" }),
        deploymentNode("aws_ecs_cluster", { name: "audience-live-check-cluster" }),
        deploymentNode("aws_ecs_service", {
          name: "audience-live-check-service",
          loadBalancer: { containerName: "api" }
        }),
        deploymentNode("aws_lb_target_group", {
          healthCheck: { path: "/health" }
        })
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  );

  assert.equal(draft.sourceRoot, "apps/api");
  assert.equal(draft.evidencePath, "apps/api/Dockerfile");
  assert.equal(draft.commitSha, repositoryRevision);
  assert.equal(draft.codeBuildProjectName, "audience-live-check-api-build");
  assert.equal(draft.ecrRepositoryName, "audience-live-check-api");
  assert.equal(draft.clusterName, "audience-live-check-cluster");
  assert.equal(draft.serviceName, "audience-live-check-service");
  assert.equal(draft.containerName, "api");
  assert.equal(draft.healthCheckPath, "/health");
  assert.equal(draft.outputUrl, "");
});

test("Architecture defaults do not replace saved ECS settings", () => {
  const draft = createDeploymentTargetDraft(
    {
      projectId: "project-1",
      provider: "aws",
      connectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      runtimeTargetKind: "ecs_fargate",
      confirmedBuildConfig: {
        sourceRoot: ".",
        evidence: [{ kind: "dockerfile", path: "Dockerfile.prod" }],
        installPreset: "none",
        buildPreset: "docker_build",
        artifactOutputPath: null,
        runtimeEntrypoint: null,
        healthCheckPath: "/ready",
        dockerfilePath: "Dockerfile.prod",
        packageManifestPath: null,
        samTemplatePath: null,
        appSpecPath: null,
        staticOutputPath: null,
        exactSemVerTag: null,
        manifestVersion: null,
        confirmedCommitSha: "c".repeat(40),
        confirmedAt: "2026-07-15T00:00:00.000Z"
      },
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "saved-build",
        ecrRepositoryName: "saved-ecr",
        clusterName: "saved-cluster",
        serviceName: "saved-service",
        containerName: "saved-container",
        outputUrl: "https://saved.example.com"
      },
      rolloutStrategy: "all_at_once",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    [verifiedConnection],
    null,
    null,
    "preserve_target",
    {
      nodes: [
        deploymentNode("aws_ecr_repository", { name: "board-ecr" }),
        deploymentNode("aws_ecs_cluster", { name: "board-cluster" }),
        deploymentNode("aws_ecs_service", {
          name: "board-service",
          loadBalancer: { containerName: "board-container" }
        })
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  );

  assert.equal(draft.codeBuildProjectName, "saved-build");
  assert.equal(draft.ecrRepositoryName, "saved-ecr");
  assert.equal(draft.clusterName, "saved-cluster");
  assert.equal(draft.serviceName, "saved-service");
  assert.equal(draft.containerName, "saved-container");
  assert.equal(draft.healthCheckPath, "/ready");
  assert.equal(draft.outputUrl, "https://saved.example.com");
});

test("explicit ECS defaults replace an existing non-ECS target when the caller requests it", () => {
  const draft = createDeploymentTargetDraft(
    {
      projectId: "project-1",
      provider: "aws",
      connectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      runtimeTargetKind: "lambda",
      confirmedBuildConfig: null,
      runtimeConfig: {
        runtimeTargetKind: "lambda",
        functionLogicalId: "ApiFunction",
        functionName: "old-function",
        aliasName: "live",
        codeDeployApplicationName: "old-app",
        codeDeployDeploymentGroupName: "old-group",
        outputUrl: "https://old.example.com"
      },
      rolloutStrategy: "all_at_once",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    [verifiedConnection],
    null,
    {
      projectName: "Audience Live Check",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile"
    },
    "prefer_ecs_defaults"
  );

  assert.equal(draft.runtimeTargetKind, "ecs_fargate");
  assert.equal(draft.codeBuildProjectName, "audience-live-check-app-build");
  assert.equal(draft.ecrRepositoryName, "audience-live-check-app");
  assert.equal(draft.clusterName, "audience-live-check-cluster");
  assert.equal(draft.serviceName, "audience-live-check-service");
  assert.equal(draft.containerName, "web");
  assert.equal(draft.outputUrl, "");
});

function deploymentNode(resourceType: string, values: Record<string, unknown>) {
  return {
    id: resourceType,
    type: resourceType,
    kind: "resource" as const,
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    label: resourceType,
    locked: false,
    zIndex: 1,
    parameters: {
      resourceType,
      resourceName: resourceType,
      fileName: "main.tf",
      values
    }
  };
}
