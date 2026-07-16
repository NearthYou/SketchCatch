import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConfirmedBuildConfig,
  ProjectDeploymentRuntimeConfig,
  RuntimeTargetKind
} from "@sketchcatch/types";
import { createGitCicdAutomationFiles } from "./git-cicd-workflows.js";

const artifactFingerprint = "a".repeat(64);
const targetFingerprint = "b".repeat(64);

const cases: ReadonlyArray<{
  readonly kind: RuntimeTargetKind;
  readonly build: ConfirmedBuildConfig;
  readonly runtime: ProjectDeploymentRuntimeConfig;
  readonly mutationStep: string;
}> = [
  {
    kind: "ecs_fargate",
    build: createBuild({ buildPreset: "docker_build", dockerfilePath: "Dockerfile" }),
    runtime: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "app-build",
      ecrRepositoryName: "app",
      clusterName: "cluster",
      serviceName: "service",
      containerName: "web",
      outputUrl: "https://ecs.example.com"
    },
    mutationStep: "Deploy ECS Fargate revision"
  },
  {
    kind: "lambda",
    build: createBuild({ buildPreset: "sam_build", samTemplatePath: "template.yaml" }),
    runtime: {
      runtimeTargetKind: "lambda",
      functionLogicalId: "ApiFunction",
      functionName: "api-function",
      aliasName: "live",
      codeDeployApplicationName: "api-app",
      codeDeployDeploymentGroupName: "api-group",
      outputUrl: "https://lambda.example.com"
    },
    mutationStep: "Publish immutable Lambda version"
  },
  {
    kind: "ec2_asg",
    build: createBuild({ buildPreset: "codedeploy_bundle", appSpecPath: "appspec.yml" }),
    runtime: {
      runtimeTargetKind: "ec2_asg",
      codeDeployApplicationName: "server-app",
      codeDeployDeploymentGroupName: "server-group",
      autoScalingGroupName: "server-asg",
      outputUrl: "https://asg.example.com"
    },
    mutationStep: "Deploy EC2 ASG bundle AllAtOnce"
  },
  {
    kind: "static_site",
    build: createBuild({
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "static_export",
      artifactOutputPath: "dist",
      staticOutputPath: "dist"
    }),
    runtime: {
      runtimeTargetKind: "static_site",
      hostingBucketName: "customer-static-bucket",
      cloudFrontDistributionId: "E1234567890",
      cloudFrontOriginId: "customer-origin",
      outputUrl: "https://static.example.com"
    },
    mutationStep: "Publish versioned static release"
  }
];

test("all generated GitOps application workflows gate mutations on provider convergence", () => {
  for (const item of cases) {
    const files = createGitCicdAutomationFiles({
      projectId: "project-1",
      projectSlug: "customer-app",
      repositoryOwner: "NearthYou",
      repositoryName: "customer-app",
      targetBranch: "main",
      awsRegion: "ap-northeast-2",
      awsAccountId: "123456789012",
      runtimeTargetKind: item.kind,
      confirmedBuildConfig: item.build,
      runtimeConfig: item.runtime,
      applicationArtifactFingerprint: artifactFingerprint,
      deploymentTargetFingerprint: targetFingerprint
    });
    const workflow = files.find((file) => file.path === ".github/workflows/sketchcatch-app.yml")?.content;
    const helper = files.find((file) => file.path.endsWith("/runtime-convergence.sh"))?.content;

    assert.ok(workflow, item.kind);
    assert.ok(helper, item.kind);
    assert.match(workflow, /Run provider-neutral runtime convergence preflight/u, item.kind);
    assert.ok(workflow.indexOf("Run provider-neutral runtime convergence preflight") < workflow.indexOf(item.mutationStep));
    assert.match(workflow, /if: env\.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'/u, item.kind);
    assert.match(workflow, /schemaVersion[^\n]{0,12}3/u, item.kind);
    assert.match(workflow, /convergence/u, item.kind);
    assert.match(workflow, /artifact/u, item.kind);
    assert.match(workflow, new RegExp(artifactFingerprint, "u"), item.kind);
    assert.match(workflow, new RegExp(targetFingerprint, "u"), item.kind);
    assert.match(helper, /aws sts get-caller-identity/u, item.kind);
    assert.match(helper, /AWS_REGION.*SKETCHCATCH_AWS_REGION/u, item.kind);
    assert.doesNotMatch(helper, /aws (?:ecs update-service|lambda update|deploy create-deployment|cloudfront update-distribution)/u, item.kind);
    assert.match(helper, /launchType/u, "ECS no-op must verify Fargate capacity");
    assert.match(helper, /Architectures/u, "Lambda no-op must verify compute architecture");
    assert.match(helper, /LastUpdateStatus/u, "Lambda no-op must verify provider health");
    if (item.kind === "ecs_fargate") {
      assert.match(workflow, /launchType/u, "ECS rollout must refuse a non-Fargate service");
      assert.match(helper, /\$s\.status == "ACTIVE"/u);
      assert.match(helper, /\$s\.desiredCount > 0/u);
      assert.match(workflow, /service\.get\("status"\) == "ACTIVE"/u);
      assert.match(workflow, /desired_count > 0/u);
    }
    if (item.kind === "lambda") {
      assert.match(
        workflow,
        /get-function-configuration[\s\S]*Architectures/u,
        "Lambda rollout must refuse a mismatched compute architecture before mutation"
      );
    }
    if (item.kind === "static_site") {
      const manifestBuilder = workflow.slice(
        workflow.indexOf("manifest = {"),
        workflow.indexOf("ARTIFACT_HASH=")
      );
      assert.doesNotMatch(
        manifestBuilder,
        /artifactFingerprint|deploymentTargetFingerprint/u,
        "static artifact bytes must remain independent from the deployment target"
      );
      assert.match(workflow, /X-SketchCatch-Artifact-Fingerprint/u);
      assert.match(workflow, /X-SketchCatch-Deployment-Target-Fingerprint/u);
      assert.match(helper, /CustomHeaders/u);
    }
  }
});

function createBuild(overrides: Partial<ConfirmedBuildConfig>): ConfirmedBuildConfig {
  return {
    sourceRoot: ".",
    evidence: [],
    installPreset: "none",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: null,
    packageManifestPath: null,
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "c".repeat(40),
    confirmedAt: "2026-07-16T00:00:00.000Z",
    ...overrides
  };
}
