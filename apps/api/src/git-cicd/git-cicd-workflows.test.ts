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
  assert.equal(
    [...(files[0]?.content ?? "").matchAll(/environment: sketchcatch-production/g)].length,
    2
  );
  assert.equal(
    [...(files[0]?.content ?? "").matchAll(/backend "s3" \{\}/g)].length,
    2
  );
  assert.equal(
    [...(files[0]?.content ?? "").matchAll(/Existing Terraform backend must be s3\./g)].length,
    2
  );
  assert.doesNotMatch(files[0]?.content ?? "", /cat > sketchcatch-backend\.tf/);
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
  assert.match(files[2]?.content ?? "", /backend "s3" \{\}/);
  assert.match(files[2]?.content ?? "", /Existing Terraform backend must be s3\./);
  assert.doesNotMatch(files[2]?.content ?? "", /cat > sketchcatch-backend\.tf/);
  assert.match(files[2]?.content ?? "", /aws s3 rm .*\/lambda\/" --recursive/);
  assert.match(files[2]?.content ?? "", /aws s3 rm .*\/demo-project\/ec2-asg\/" --recursive/);
  assert.match(files[2]?.content ?? "", /SKETCHCATCH_STATIC_BUCKET.*\/releases\/" --recursive/);
  const manifest = files.find(
    (file) => file.path === "sketchcatch/demo-project/ci-cd/handoff.json"
  );
  assert.ok(manifest);
  assert.match(manifest.content, /"handoffId": "handoff-123"/);
  assert.match(manifest.content, /"userAcceptedChangeId": "accepted-change-123"/);
});

test("ECS Fargate automation uses confirmed Docker evidence and immutable release controls", () => {
  const files = createGitCicdAutomationFiles({
    projectSlug: "api-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    appPath: "apps/api",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: "apps/api",
      evidence: [{ kind: "dockerfile", path: "apps/api/Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "apps/api/Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: "1.4.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "api-build",
      ecrRepositoryName: "api",
      clusterName: "api-cluster",
      serviceName: "api-service",
      containerName: "api",
      outputUrl: "https://api.example.com"
    }
  });

  const appWorkflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-app.yml"
  )?.content ?? "";
  const buildspec = files.find(
    (file) => file.path === "sketchcatch/api-project/ci-cd/buildspec-ecs.yml"
  )?.content ?? "";
  const settings = createRepositorySettingsPreview({
    projectSlug: "api-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: "apps/api",
      evidence: [{ kind: "dockerfile", path: "apps/api/Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "apps/api/Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "api-build",
      ecrRepositoryName: "api",
      clusterName: "api-cluster",
      serviceName: "api-service",
      containerName: "api",
      outputUrl: "https://api.example.com"
    }
  });

  assert.match(appWorkflow, /name: Run CodeBuild/);
  assert.match(appWorkflow, /head_branch == 'main'/);
  assert.doesNotMatch(appWorkflow, /head_branch == "main"/);
  assert.match(buildspec, /env:\n {2}shell: bash\n {2}exported-variables:/);
  assert.match(appWorkflow, /codebuild start-build/);
  assert.match(appWorkflow, /--source-version "\$SKETCHCATCH_RELEASE_SHA"/);
  assert.match(appWorkflow, /github\.event\.workflow_run\.head_sha/);
  assert.doesNotMatch(appWorkflow, /\n {2}push:/);
  assert.match(files[0]?.content ?? "", /"apps\/api\/\*\*"/);
  assert.match(appWorkflow, /name: Publish immutable ECR digest/);
  assert.match(appWorkflow, /name: Deploy ECS Fargate revision/);
  assert.match(appWorkflow, /SKETCHCATCH_DESIRED_COUNT=/);
  assert.match(appWorkflow, /--desired-count 0/);
  assert.match(appWorkflow, /--desired-count "\$SKETCHCATCH_DESIRED_COUNT"/);
  assert.match(appWorkflow, /minimumHealthyPercent=0,maximumPercent=200/);
  assert.match(appWorkflow, /minimumHealthyPercent=0,maximumPercent=100/);
  assert.match(appWorkflow, /deploymentCircuitBreaker=\{enable=true,rollback=true\}/);
  assert.match(appWorkflow, /name: Verify ECS release/);
  assert.match(appWorkflow, /SKETCHCATCH_HEALTH_CHECK_PATH: "\/health"/);
  assert.match(
    appWorkflow,
    /HEALTH_URL="\$\{SKETCHCATCH_OUTPUT_URL%\/\}\$\{SKETCHCATCH_HEALTH_CHECK_PATH\}"/
  );
  assert.match(appWorkflow, /desired_count >= 0/);
  assert.match(appWorkflow, /curl .*"\$HEALTH_URL"/);
  assert.match(appWorkflow, /SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64/);
  assert.match(buildspec, /docker buildx create --use/);
  assert.match(buildspec, /docker buildx build/);
  assert.match(buildspec, /--cache-from type=registry,ref="\$SKETCHCATCH_CACHE_URI"/);
  assert.match(
    buildspec,
    /--cache-to type=registry,ref="\$SKETCHCATCH_CACHE_URI",mode=max,oci-mediatypes=true,image-manifest=true,ignore-error=true/
  );
  assert.match(buildspec, /SKETCHCATCH_CACHE_URI="\$SKETCHCATCH_ECR_URI:sketchcatch-buildcache-v1"/);
  assert.match(buildspec, /--push/);
  assert.doesNotMatch(buildspec, /docker push/);
  assert.doesNotMatch(appWorkflow, /sketchcatch-buildcache-v1/);
  assert.match(buildspec, /imageDigest/);
  assert.equal(settings.variables.SKETCHCATCH_CODEBUILD_PROJECT, "api-build");
  assert.equal(settings.variables.SKETCHCATCH_ECR_REPOSITORY, "api");
  assert.equal(settings.variables.SKETCHCATCH_ECS_CLUSTER, "api-cluster");
  assert.equal(settings.variables.SKETCHCATCH_ECS_SERVICE, "api-service");
  assert.equal(settings.variables.SKETCHCATCH_ECS_CONTAINER, "api");
  assert.equal(settings.variables.SKETCHCATCH_OUTPUT_URL, "https://api.example.com");
});

test("Lambda automation uses confirmed SAM evidence and CodeDeploy AllAtOnce rollback controls", () => {
  const files = createGitCicdAutomationFiles({
    projectSlug: "worker-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    appPath: "apps/worker",
    runtimeTargetKind: "lambda",
    confirmedBuildConfig: {
      sourceRoot: "apps/worker",
      evidence: [{ kind: "sam_template", path: "apps/worker/template.yaml" }],
      installPreset: "none",
      buildPreset: "sam_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: null,
      packageManifestPath: null,
      samTemplatePath: "apps/worker/template.yaml",
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: "2.0.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "lambda",
      functionLogicalId: "ApiFunction",
      functionName: "sketchcatch-api",
      aliasName: "live",
      codeDeployApplicationName: "sketchcatch-api",
      codeDeployDeploymentGroupName: "sketchcatch-api-live",
      outputUrl: "https://lambda.example.com"
    }
  });

  const appWorkflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-app.yml"
  )?.content ?? "";
  const settings = createRepositorySettingsPreview({
    projectSlug: "worker-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    runtimeTargetKind: "lambda",
    runtimeConfig: {
      runtimeTargetKind: "lambda",
      functionLogicalId: "ApiFunction",
      functionName: "sketchcatch-api",
      aliasName: "live",
      codeDeployApplicationName: "sketchcatch-api",
      codeDeployDeploymentGroupName: "sketchcatch-api-live",
      outputUrl: "https://lambda.example.com"
    }
  });

  assert.match(appWorkflow, /name: Build confirmed SAM application/);
  assert.match(appWorkflow, /sam build --template-file/);
  assert.match(appWorkflow, /apps\/worker\/template\.yaml/);
  assert.match(appWorkflow, /name: Publish immutable Lambda version/);
  assert.match(appWorkflow, /update-function-code/);
  assert.match(appWorkflow, /CodeDeployDefault\.LambdaAllAtOnce/);
  assert.match(appWorkflow, /DEPLOYMENT_FAILURE/);
  assert.match(appWorkflow, /import textwrap/);
  assert.match(appWorkflow, /content = textwrap\.dedent\(/);
  assert.match(appWorkflow, /aws lambda update-alias/);
  assert.match(appWorkflow, /--revision-id/);
  assert.match(appWorkflow, /cancel-in-progress: false/);
  assert.match(appWorkflow, /name: Deploy Lambda alias AllAtOnce/);
  assert.match(appWorkflow, /name: Verify Lambda release/);
  assert.match(appWorkflow, /SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64/);
  assert.match(appWorkflow, /curl .*HEALTH_URL/);
  assert.doesNotMatch(appWorkflow, /skipping/iu);
  assert.equal(settings.variables.SKETCHCATCH_LAMBDA_FUNCTION, "sketchcatch-api");
  assert.equal(settings.variables.SKETCHCATCH_LAMBDA_ALIAS, "live");
  assert.equal(settings.variables.SKETCHCATCH_CODEDEPLOY_APPLICATION, "sketchcatch-api");
  assert.equal(settings.variables.SKETCHCATCH_CODEDEPLOY_GROUP, "sketchcatch-api-live");
  assert.equal(settings.variables.SKETCHCATCH_OUTPUT_URL, "https://lambda.example.com");
});

test("EC2 ASG automation publishes a versioned bundle and verifies AllAtOnce rollback", () => {
  const input = {
    projectSlug: "api-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    appPath: "apps/api",
    releaseBucket: "sketchcatch-release",
    runtimeTargetKind: "ec2_asg" as const,
    confirmedBuildConfig: {
      sourceRoot: "apps/api",
      evidence: [{ kind: "appspec" as const, path: "apps/api/appspec.yml" }],
      installPreset: "none" as const,
      buildPreset: "codedeploy_bundle" as const,
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: null,
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: "apps/api/appspec.yml",
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: "3.0.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ec2_asg" as const,
      codeDeployApplicationName: "sketchcatch-api",
      codeDeployDeploymentGroupName: "sketchcatch-api-asg",
      autoScalingGroupName: "sketchcatch-api-asg",
      outputUrl: "https://ec2.example.com"
    }
  };
  const files = createGitCicdAutomationFiles(input);
  const appWorkflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-app.yml"
  )?.content ?? "";
  const settings = createRepositorySettingsPreview(input);

  assert.match(appWorkflow, /name: Build confirmed CodeDeploy bundle/);
  assert.match(appWorkflow, /name: Publish versioned S3 bundle/);
  assert.match(appWorkflow, /get-bucket-versioning/);
  assert.match(appWorkflow, /put-object/);
  assert.match(appWorkflow, /--checksum-algorithm SHA256/);
  assert.match(appWorkflow, /VersionId/);
  assert.match(appWorkflow, /CodeDeployDefault\.AllAtOnce/);
  assert.match(appWorkflow, /DEPLOYMENT_FAILURE/);
  assert.match(appWorkflow, /lastSuccessfulDeployment/);
  assert.match(appWorkflow, /rollbackDeploymentId/);
  assert.match(appWorkflow, /list-deployment-instances/);
  assert.match(appWorkflow, /include-only-statuses Succeeded/);
  assert.match(appWorkflow, /SketchCatch instance-failure rollback/);
  assert.match(appWorkflow, /FAILURE_REASON=instance_failure/);
  assert.match(appWorkflow, /SKETCHCATCH_EC2_RELEASE_EVIDENCE_B64/);
  assert.match(appWorkflow, /curl .*HEALTH_URL/);
  assert.doesNotMatch(appWorkflow, /start-instance-refresh/);
  assert.equal(settings.variables.SKETCHCATCH_ASG_NAME, "sketchcatch-api-asg");
  assert.equal(settings.variables.SKETCHCATCH_CODEDEPLOY_APPLICATION, "sketchcatch-api");
  assert.equal(settings.variables.SKETCHCATCH_CODEDEPLOY_GROUP, "sketchcatch-api-asg");
  assert.equal(settings.variables.SKETCHCATCH_OUTPUT_URL, "https://ec2.example.com");
});

test("Static automation publishes an immutable manifest and rolls back the CloudFront origin", () => {
  const input = {
    projectSlug: "web-project",
    repositoryOwner: "owner",
    repositoryName: "repo",
    targetBranch: "main",
    appPath: "apps/web",
    runtimeTargetKind: "static_site" as const,
    confirmedBuildConfig: {
      sourceRoot: "apps/web",
      evidence: [{ kind: "static_output" as const, path: "apps/web/dist" }],
      installPreset: "pnpm_frozen_lockfile" as const,
      buildPreset: "static_export" as const,
      artifactOutputPath: "apps/web/dist",
      runtimeEntrypoint: null,
      healthCheckPath: null,
      dockerfilePath: null,
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: "apps/web/dist",
      exactSemVerTag: null,
      manifestVersion: "4.0.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-14T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "static_site" as const,
      hostingBucketName: "sketchcatch-static-releases",
      cloudFrontDistributionId: "E1234567890ABC",
      cloudFrontOriginId: "static-origin",
      outputUrl: "https://static.example.com"
    }
  };
  const files = createGitCicdAutomationFiles(input);
  const appWorkflow = files.find(
    (file) => file.path === ".github/workflows/sketchcatch-app.yml"
  )?.content ?? "";
  const settings = createRepositorySettingsPreview(input);

  assert.match(appWorkflow, /name: Build confirmed static output/);
  assert.match(appWorkflow, /pnpm install --frozen-lockfile/);
  assert.match(appWorkflow, /name: Publish versioned static release/);
  assert.match(appWorkflow, /get-bucket-versioning/);
  assert.match(appWorkflow, /--checksum-algorithm SHA256/);
  assert.match(appWorkflow, /SKETCHCATCH_MANIFEST_VERSION_ID/);
  assert.match(appWorkflow, /name: Switch CloudFront release pointer/);
  assert.match(appWorkflow, /update-distribution/);
  assert.match(appWorkflow, /create-invalidation/);
  assert.match(appWorkflow, /name: Verify static release and rollback/);
  assert.match(appWorkflow, /SKETCHCATCH_STATIC_RELEASE_EVIDENCE_B64/);
  assert.match(appWorkflow, /SKETCHCATCH_PREVIOUS_ORIGIN_PATH/);
  assert.match(appWorkflow, /SKETCHCATCH_BASELINE_CAPTURED/);
  assert.match(appWorkflow, /changed outside this release; refusing rollback/);
  assert.match(appWorkflow, /health_check_failure/);
  assert.match(files[0]?.content ?? "", /"apps\/web\/\*\*"/);
  assert.equal(settings.variables.SKETCHCATCH_STATIC_BUCKET, "sketchcatch-static-releases");
  assert.equal(settings.variables.SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID, "E1234567890ABC");
  assert.equal(settings.variables.SKETCHCATCH_CLOUDFRONT_ORIGIN_ID, "static-origin");
  assert.equal(settings.variables.SKETCHCATCH_OUTPUT_URL, "https://static.example.com");
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
