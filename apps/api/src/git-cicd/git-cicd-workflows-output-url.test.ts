import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitCicdAutomationFiles,
  createRepositorySettingsPreview
} from "./git-cicd-workflows.js";

test("ECS GitOps setup fails before rendering settings without an output URL", () => {
  assert.throws(
    () => createRepositorySettingsPreview({
      projectSlug: "audience-live-check",
      repositoryOwner: "NearthYou",
      repositoryName: "SketchCatch",
      targetBranch: "main",
      runtimeTargetKind: "ecs_fargate",
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-app-build",
        ecrRepositoryName: "audience-live-check-app",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "web",
        outputUrl: null
      }
    }),
    /DEPLOYMENT_OUTPUT_URL_REQUIRED/
  );
});

test("ECS application and infrastructure workflows have independent triggers", () => {
  const files = createGitCicdAutomationFiles({
    projectId: "11111111-1111-4111-8111-111111111111",
    projectSlug: "audience-live-check",
    repositoryOwner: "jh-9999",
    repositoryName: "audience-live-check",
    targetBranch: "main",
    sketchCatchPublicBaseUrl: "https://sketchcatch.example.com",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [],
      dockerfilePath: "apps/api/Dockerfile",
      artifactOutputPath: "apps/web/dist",
      buildPreset: "docker_build",
      installPreset: "pnpm_frozen_lockfile",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-15T00:00:00.000Z",
      healthCheckPath: "/health",
      runtimeEntrypoint: null,
      packageManifestPath: "apps/web/package.json",
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: null,
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
          lockfilePath: "pnpm-lock.yaml",
          outputPath: "apps/web/dist",
          packageManager: "pnpm",
          packageManagerVersion: "10.11.1",
          installPreset: "pnpm_frozen_lockfile",
          buildPreset: "pnpm_build"
        }
      }
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "audience-live-check-build",
      ecrRepositoryName: "audience-live-check-api",
      clusterName: "audience-live-check-cluster",
      serviceName: "audience-live-check-service",
      containerName: "api",
      outputUrl: "https://d111111abcdef8.cloudfront.net"
    }
  });
  const workflow = files.find((file) => file.path === ".github/workflows/sketchcatch-app.yml");
  const infraWorkflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-infra.yml"
  );

  assert(workflow);
  assert(infraWorkflow);
  assert.match(workflow.content, /\/api\/git-cicd\/projects\/\$SKETCHCATCH_PROJECT_ID\/release-runs/);
  assert.match(workflow.content, /permissions:\n {2}id-token: write/);
  assert.match(workflow.content, /sketchcatch-release-run/);
  assert.match(workflow.content, /on:\n {2}push:\n {4}branches: \["main"\]/);
  assert.match(workflow.content, /SKETCHCATCH_RELEASE_SHA: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow.content, /workflow_run|head_sha/);
  assert.doesNotMatch(workflow.content, /workflow_dispatch/);
  assert.match(workflow.content, /'!\.github\/workflows\/sketchcatch-infra\.yml'/);
  assert.match(workflow.content, /'!\.github\/workflows\/sketchcatch-app\.yml'/);
  assert.match(workflow.content, /'!\.github\/workflows\/sketchcatch-destroy\.yml'/);
  assert.doesNotMatch(workflow.content, /configure-aws-credentials|\baws (codebuild|ecr|ecs|s3|cloudfront)\b/);
  assert.match(infraWorkflow.content, /on:\n {2}workflow_dispatch:/);
  assert.match(infraWorkflow.content, /SKETCHCATCH_OIDC_AUDIENCE: sketchcatch-infrastructure-run/);
  assert.doesNotMatch(infraWorkflow.content, /SKETCHCATCH_OIDC_AUDIENCE: sketchcatch-release-run/);
  assert.doesNotMatch(infraWorkflow.content, /\n {2}push:/);
  assert.doesNotMatch(infraWorkflow.content, /workflow_run/);
  assert.match(infraWorkflow.content, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(infraWorkflow.content, /\/infrastructure-runs/);
  assert.match(infraWorkflow.content, /\/heartbeat/);
  assert.match(infraWorkflow.content, /\/complete/);
  assert.match(
    infraWorkflow.content,
    /send_heartbeat\n {10}if ! run_with_heartbeat aws s3api head-bucket/
  );
  assert.match(
    infraWorkflow.content,
    /send_heartbeat\n {10}run_with_heartbeat terraform plan -out=tfplan\n {10}send_heartbeat/
  );
  assert.match(
    infraWorkflow.content,
    /send_heartbeat\n {10}run_with_heartbeat terraform apply -auto-approve tfplan\n {10}send_heartbeat/
  );
  assert.match(infraWorkflow.content, /terraform plan -out=tfplan/);
  assert.match(infraWorkflow.content, /steps\.plan\.outcome == 'success'/);
  assert.match(infraWorkflow.content, /terraform apply -auto-approve tfplan/);
  assert.match(
    infraWorkflow.content,
    /if \[ "\$\{\{ job\.status \}\}" = "cancelled" \]; then/
  );
  assert.doesNotMatch(infraWorkflow.content, /\$\{\{ cancelled\(\) \}\}/);
  assert.match(infraWorkflow.content, /actions\/upload-artifact/);
  assert.doesNotMatch(infraWorkflow.content, /actions\/download-artifact/);
  assert.equal(
    files.some((file) => file.path.endsWith("buildspec-ecs.yml")),
    false
  );
  assert.equal(
    files.some((file) => file.content.includes("buildspec-ecs.yml")),
    false
  );
});
