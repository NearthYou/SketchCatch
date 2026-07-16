import assert from "node:assert/strict";
import test from "node:test";

import { createGitCicdAutomationFiles } from "./git-cicd-workflows.js";

test("ECS GitHub Actions delegates deployment and runtime convergence to the SketchCatch backend worker", () => {
  const files = createGitCicdAutomationFiles({
    projectId: "project-1",
    projectSlug: "customer-app",
    repositoryOwner: "NearthYou",
    repositoryName: "customer-app",
    targetBranch: "main",
    sketchCatchPublicBaseUrl: "https://sketchcatch.example.com",
    awsRegion: "ap-northeast-2",
    awsAccountId: "123456789012",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [],
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
      confirmedCommitSha: "c".repeat(40),
      confirmedAt: "2026-07-16T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "app-build",
      ecrRepositoryName: "app",
      clusterName: "cluster",
      serviceName: "service",
      containerName: "web",
      outputUrl: "https://ecs.example.com"
    },
    applicationArtifactFingerprint: "a".repeat(64),
    deploymentTargetFingerprint: "b".repeat(64)
  });

  const workflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-app.yml"
  )?.content;

  assert.ok(workflow);
  assert.match(workflow, /Request trusted SketchCatch release/u);
  assert.match(workflow, /Wait for trusted release/u);
  assert.match(
    workflow,
    /\/api\/git-cicd\/projects\/\$SKETCHCATCH_PROJECT_ID\/release-runs/u
  );
  assert.match(
    workflow,
    /\/api\/git-cicd\/release-runs\/\$SKETCHCATCH_RELEASE_RUN_ID/u
  );
  assert.match(workflow, /SKETCHCATCH_OIDC_AUDIENCE: sketchcatch-release-run/u);
  assert.match(workflow, /succeeded\) exit 0/u);
  assert.match(
    workflow,
    /failed\|cancelled\|partially_failed\|partially_cancelled/u
  );

  assert.doesNotMatch(workflow, /configure-aws-credentials/u);
  assert.doesNotMatch(
    workflow,
    /\baws (?:codebuild|ecr|ecs|s3|cloudfront|sts)\b/u
  );
  assert.doesNotMatch(
    workflow,
    /Run provider-neutral runtime convergence preflight|Deploy ECS Fargate revision/u
  );
  assert.equal(
    files.some(
      (file) =>
        file.path.endsWith("/runtime-convergence.sh") ||
        file.path.endsWith("/buildspec-ecs.yml")
    ),
    false,
    "AWS provider verification and runtime convergence belong to SketchCatch backend/worker tests"
  );
});
