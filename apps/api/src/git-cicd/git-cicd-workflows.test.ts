import assert from "node:assert/strict";
import test from "node:test";
import {
  createAwsRoleDiffPreview,
  createGitCicdAutomationFiles,
  createRepositorySettingsPreview
} from "./git-cicd-workflows.js";

test("createGitCicdAutomationFiles renders infra app destroy workflows and manifests", () => {
  const files = createGitCicdAutomationFiles({
    handoffId: "handoff-123",
    projectSlug: "demo-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    appPath: "apps/web",
    infraPath: "infra/terraform",
    userAcceptedChangeId: "accepted-change-123",
    environmentName: "sketchcatch-production",
    awsRegion: "ap-northeast-2",
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    tfStateBucket: "sketchcatch-tfstate",
    releaseBucket: "sketchcatch-release",
    rdsEnabled: false,
    staticSiteUrl: "https://static.example.invalid",
    apiBaseUrl: "https://api.example.invalid"
  });

  assert.deepEqual(
    files.map((file) => file.path),
    [
      ".github/workflows/sketchcatch-infra.yml",
      ".github/workflows/sketchcatch-app.yml",
      ".github/workflows/sketchcatch-destroy.yml",
      "sketchcatch/demo-project/ci-cd/repository-settings.json",
      "sketchcatch/demo-project/ci-cd/aws-role-diff.json",
      "sketchcatch/demo-project/ci-cd/handoff.json"
    ]
  );
  assert.match(files[0]?.content ?? "", /terraform plan/);
  assert.match(files[0]?.content ?? "", /"infra\/terraform\/\*\*"/);
  assert.match(files[0]?.content ?? "", /environment: sketchcatch-production/);
  assert.match(files[1]?.content ?? "", /start-instance-refresh/);
  assert.match(files[1]?.content ?? "", /branches: \["main"\]/);
  assert.match(files[1]?.content ?? "", /"apps\/web\/\*\*"/);
  assert.match(files[1]?.content ?? "", /github\.event_name == 'push'/);
  assert.match(files[1]?.content ?? "", /python3 -/);
  assert.doesNotMatch(files[1]?.content ?? "", /python -/);
  assert.match(files[1]?.content ?? "", /SKETCHCATCH_RELEASE_ID/);
  assert.match(files[1]?.content ?? "", /create-launch-template-version/);
  assert.match(files[1]?.content ?? "", /LaunchTemplateName/);
  assert.match(files[1]?.content ?? "", /describe-instance-refreshes/);
  assert.match(files[2]?.content ?? "", /terraform destroy/);
  const manifest = files.find(
    (file) => file.path === "sketchcatch/demo-project/ci-cd/handoff.json"
  );
  assert.ok(manifest);
  assert.match(manifest.content, /"handoffId": "handoff-123"/);
  assert.match(manifest.content, /"userAcceptedChangeId": "accepted-change-123"/);
});

test("default S3 bucket names trim separators left at the 63-character boundary", () => {
  const preview = createRepositorySettingsPreview({
    projectSlug: "demo-project",
    repositoryOwner: `${"a".repeat(41)}.`,
    repositoryName: "repo",
    targetBranch: "main"
  });
  const stateBucket = preview.variables.SKETCHCATCH_TF_STATE_BUCKET;
  const releaseBucket = preview.variables.SKETCHCATCH_RELEASE_BUCKET;

  assert.ok(stateBucket);
  assert.ok(releaseBucket);
  assert.ok(stateBucket.length <= 63);
  assert.ok(releaseBucket.length <= 63);
  assert.match(stateBucket, /[a-z0-9]$/);
  assert.match(releaseBucket, /[a-z0-9]$/);
});

test("default S3 bucket names replace dots for virtual-hosted TLS compatibility", () => {
  const preview = createRepositorySettingsPreview({
    projectSlug: "demo-project",
    repositoryOwner: "owner.with.dots",
    repositoryName: "repo.with.dots",
    targetBranch: "main"
  });

  assert.doesNotMatch(preview.variables.SKETCHCATCH_TF_STATE_BUCKET ?? "", /\./);
  assert.doesNotMatch(preview.variables.SKETCHCATCH_RELEASE_BUCKET ?? "", /\./);
});

test("repository settings preview masks secrets and includes required variables", () => {
  const preview = createRepositorySettingsPreview({
    projectSlug: "demo-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });

  assert.equal(preview.environmentName, "sketchcatch-production");
  assert.equal(
    preview.variables.SKETCHCATCH_AWS_ROLE_ARN,
    "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  );
  assert.equal(preview.variables.SKETCHCATCH_RDS_ENABLED, "false");
  assert.deepEqual(preview.secrets, []);
});

test("aws role diff preview scopes GitHub OIDC trust to repository and environment", () => {
  const diff = createAwsRoleDiffPreview({
    projectSlug: "demo-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    environmentName: "sketchcatch-production"
  });

  assert.equal(diff.repository, "owner/repo");
  assert.equal(
    diff.requiredTrustConditions["token.actions.githubusercontent.com:sub"],
    "repo:owner/repo:environment:sketchcatch-production"
  );
  assert.equal(diff.approved, false);
});
