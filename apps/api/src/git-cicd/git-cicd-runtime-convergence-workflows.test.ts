import assert from "node:assert/strict";
import test from "node:test";

import { createGitCicdAutomationFiles } from "./git-cicd-workflows.js";

test("generated workflows reject a stale Repository project binding before external work", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const files = createGitCicdAutomationFiles({
    projectId,
    projectSlug: "customer-app",
    repositoryOwner: "NearthYou",
    repositoryName: "customer-app",
    targetBranch: "main",
    sketchCatchPublicBaseUrl: "https://sketchcatch.example.com"
  });
  assert.equal(
    files.some((file) => file.path.endsWith("/ci-cd/retry.json")),
    false,
    "initial setup must not create the retry-only trigger file"
  );

  for (const workflowPath of [
    ".github/workflows/sketchcatch-app.yml",
    ".github/workflows/sketchcatch-infra.yml",
    ".github/workflows/sketchcatch-destroy.yml"
  ]) {
    const workflow = files.find((file) => file.path === workflowPath)?.content;
    assert.ok(workflow, `${workflowPath} must be generated`);
    assert.match(
      workflow,
      new RegExp(`SKETCHCATCH_EXPECTED_PROJECT_ID: ["']?${projectId}["']?`)
    );
    assert.match(workflow, /SKETCHCATCH_PROJECT_ID: \$\{\{ vars\.SKETCHCATCH_PROJECT_ID \}\}/u);
    assert.match(workflow, /Validate SketchCatch project binding/u);
    assert.match(workflow, /SketchCatch project binding mismatch/u);
    assert.ok(
      workflow.indexOf("Validate SketchCatch project binding") <
        workflow.indexOf("aws-actions/configure-aws-credentials"),
      `${workflowPath} must reject a stale project before AWS credentials are used`
    );
  }
});

test("ECS GitHub Actions delegates deployment and runtime convergence to the SketchCatch backend worker", () => {
  const files = createGitCicdAutomationFiles({
    projectId: "project-1",
    projectSlug: "customer-app",
    repositoryOwner: "NearthYou",
    repositoryName: "customer-app",
    targetBranch: "main",
    sketchCatchPublicBaseUrl: "https://sketchcatch.example.com",
    setupRetryToken: "handoff-previous:failed-head-sha",
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
  assert.match(workflow, /--retry 5 --retry-all-errors/u);
  assert.match(workflow, /--connect-timeout 10 --max-time 30/u);
  assert.doesNotMatch(workflow, /curl --fail(?:\s|\\)/u);
  assert.match(workflow, /curl --fail-with-body/u);
  const excludedCicdPath = workflow.indexOf("!sketchcatch/customer-app/ci-cd/**");
  const includedRetryPath = workflow.indexOf("sketchcatch/customer-app/ci-cd/retry.json");
  assert.ok(excludedCicdPath >= 0);
  assert.ok(
    includedRetryPath > excludedCicdPath,
    "retry.json must be re-included after the generated CI/CD directory exclusion"
  );
  const retryFile = files.find(
    (file) => file.path === "sketchcatch/customer-app/ci-cd/retry.json"
  );
  assert.ok(retryFile);
  assert.equal(
    JSON.parse(retryFile.content).setupRetryToken,
    "handoff-previous:failed-head-sha"
  );
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
