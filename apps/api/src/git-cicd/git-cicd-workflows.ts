import type {
  ConfirmedBuildConfig,
  ProjectDeploymentRuntimeConfig,
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview,
  RuntimeTargetKind
} from "@sketchcatch/types";

export const defaultGitCicdEnvironmentName = "sketchcatch-production";

export type GitCicdWorkflowRenderInput = {
  projectId?: string | undefined;
  handoffId?: string | undefined;
  projectSlug: string;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  appPath?: string | undefined;
  infraPath?: string | undefined;
  userAcceptedChangeId?: string | undefined;
  environmentName?: string | undefined;
  awsRegion?: string | undefined;
  awsAccountId?: string | undefined;
  awsRoleArn?: string | null | undefined;
  tfStateBucket?: string | undefined;
  tfStateKey?: string | undefined;
  releaseBucket?: string | undefined;
  rdsEnabled?: boolean | undefined;
  staticSiteUrl?: string | null | undefined;
  apiBaseUrl?: string | null | undefined;
  approvedByUserId?: string | null | undefined;
  approvedAt?: string | null | undefined;
  runtimeTargetKind?: RuntimeTargetKind | undefined;
  confirmedBuildConfig?: ConfirmedBuildConfig | null | undefined;
  runtimeConfig?: ProjectDeploymentRuntimeConfig | null | undefined;
  applicationArtifactFingerprint?: string | undefined;
  deploymentTargetFingerprint?: string | null | undefined;
};

export type GitCicdGeneratedFile = {
  path: string;
  content: string;
  contentType: string;
};

export function createGitCicdAutomationFiles(
  input: GitCicdWorkflowRenderInput
): GitCicdGeneratedFile[] {
  const settingsPreview = createRepositorySettingsPreview(input);
  const ecsFargate = getEcsFargateWorkflowInput(input);
  const lambda = getLambdaWorkflowInput(input);
  const ec2Asg = getEc2AsgWorkflowInput(input);
  const staticSite = getStaticSiteWorkflowInput(input);

  return [
    {
      path: ".github/workflows/sketchcatch-infra.yml",
      content: renderInfraWorkflow(input),
      contentType: "text/yaml"
    },
    {
      path: ".github/workflows/sketchcatch-app.yml",
      content: ecsFargate
        ? renderEcsFargateAppWorkflow(input, ecsFargate)
        : lambda
          ? renderLambdaAppWorkflow(input, lambda)
          : ec2Asg
            ? renderEc2AsgAppWorkflow(input, ec2Asg)
            : staticSite
              ? renderStaticSiteAppWorkflow(input, staticSite)
              : renderAppWorkflow(input),
      contentType: "text/yaml"
    },
    {
      path: ".github/workflows/sketchcatch-destroy.yml",
      content: renderDestroyWorkflow(input),
      contentType: "text/yaml"
    },
    {
      path: `sketchcatch/${input.projectSlug}/ci-cd/repository-settings.json`,
      content: `${JSON.stringify(settingsPreview, null, 2)}\n`,
      contentType: "application/json"
    },
    {
      path: `sketchcatch/${input.projectSlug}/ci-cd/aws-role-diff.json`,
      content: `${JSON.stringify(createAwsRoleDiffPreview(input), null, 2)}\n`,
      contentType: "application/json"
    },
    {
      path: `sketchcatch/${input.projectSlug}/ci-cd/handoff.json`,
      content: `${JSON.stringify(createHandoffManifest(input), null, 2)}\n`,
      contentType: "application/json"
    },
    ...(ecsFargate || lambda || ec2Asg || staticSite
      ? [{
          path: `sketchcatch/${input.projectSlug}/ci-cd/runtime-convergence.sh`,
          content: renderRuntimeConvergenceScript(),
          contentType: "text/x-shellscript"
        }]
      : []),
    ...(ecsFargate
      ? [
          {
            path: `sketchcatch/${input.projectSlug}/ci-cd/buildspec-ecs.yml`,
            content: renderEcsFargateBuildspec(),
            contentType: "text/yaml"
          }
        ]
      : [])
  ];
}

function createHandoffManifest(input: GitCicdWorkflowRenderInput) {
  return {
    schemaVersion: 1,
    generatedBy: "sketchcatch",
    handoffId: input.handoffId ?? null,
    userAcceptedChangeId: input.userAcceptedChangeId ?? null,
    repository: `${input.repositoryOwner}/${input.repositoryName}`,
    targetBranch: input.targetBranch,
    environmentName: input.environmentName ?? defaultGitCicdEnvironmentName
  };
}

export function createRepositorySettingsPreview(
  input: GitCicdWorkflowRenderInput
): GitCicdRepositorySettingsPreview {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const runtimeOutputUrl = getRuntimeOutputUrl(input.runtimeConfig);

  return {
    environmentName,
    variables: {
      SKETCHCATCH_AWS_REGION: input.awsRegion ?? "ap-northeast-2",
      SKETCHCATCH_AWS_ROLE_ARN: input.awsRoleArn ?? "",
      SKETCHCATCH_TF_STATE_BUCKET: input.tfStateBucket ?? createDefaultStateBucket(input),
      SKETCHCATCH_TF_STATE_KEY: input.tfStateKey ?? createDefaultStateKey(input),
      SKETCHCATCH_RELEASE_BUCKET: input.releaseBucket ?? createDefaultReleaseBucket(input),
      SKETCHCATCH_RDS_ENABLED: String(input.rdsEnabled === true),
      SKETCHCATCH_STATIC_SITE_URL: input.staticSiteUrl ?? "",
      SKETCHCATCH_API_BASE_URL: input.apiBaseUrl ?? "",
      SKETCHCATCH_ASG_NAME:
        input.runtimeConfig?.runtimeTargetKind === "ec2_asg"
          ? input.runtimeConfig.autoScalingGroupName
          : "",
      SKETCHCATCH_STATIC_BUCKET:
        input.runtimeConfig?.runtimeTargetKind === "static_site"
          ? input.runtimeConfig.hostingBucketName
          : "",
      SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID:
        input.runtimeConfig?.runtimeTargetKind === "static_site"
          ? input.runtimeConfig.cloudFrontDistributionId
          : "",
      SKETCHCATCH_CLOUDFRONT_ORIGIN_ID:
        input.runtimeConfig?.runtimeTargetKind === "static_site"
          ? input.runtimeConfig.cloudFrontOriginId
          : "",
      SKETCHCATCH_CODEBUILD_PROJECT:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.codeBuildProjectName
          : "",
      SKETCHCATCH_ECR_REPOSITORY:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.ecrRepositoryName
          : "",
      SKETCHCATCH_LAMBDA_FUNCTION:
        input.runtimeConfig?.runtimeTargetKind === "lambda"
          ? input.runtimeConfig.functionName
          : "",
      SKETCHCATCH_LAMBDA_ALIAS:
        input.runtimeConfig?.runtimeTargetKind === "lambda"
          ? input.runtimeConfig.aliasName
          : "",
      SKETCHCATCH_CODEDEPLOY_APPLICATION:
        input.runtimeConfig?.runtimeTargetKind === "lambda" ||
        input.runtimeConfig?.runtimeTargetKind === "ec2_asg"
          ? input.runtimeConfig.codeDeployApplicationName
          : "",
      SKETCHCATCH_CODEDEPLOY_GROUP:
        input.runtimeConfig?.runtimeTargetKind === "lambda" ||
        input.runtimeConfig?.runtimeTargetKind === "ec2_asg"
          ? input.runtimeConfig.codeDeployDeploymentGroupName
          : "",
      SKETCHCATCH_ECS_CLUSTER:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.clusterName
          : "",
      SKETCHCATCH_ECS_SERVICE:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.serviceName
          : "",
      SKETCHCATCH_ECS_CONTAINER:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.containerName
          : "",
      SKETCHCATCH_OUTPUT_URL:
        runtimeOutputUrl
    },
    secrets: [],
    workflowFiles: [
      ".github/workflows/sketchcatch-infra.yml",
      ".github/workflows/sketchcatch-app.yml",
      ".github/workflows/sketchcatch-destroy.yml"
    ]
  };
}

type EcsFargateWorkflowInput = {
  confirmedBuildConfig: ConfirmedBuildConfig & {
    buildPreset: "docker_build";
    dockerfilePath: string;
  };
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }> & {
    outputUrl: string;
  };
};

type LambdaWorkflowInput = {
  confirmedBuildConfig: ConfirmedBuildConfig & {
    buildPreset: "sam_build";
    samTemplatePath: string;
  };
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "lambda" }>;
};

type Ec2AsgWorkflowInput = {
  confirmedBuildConfig: ConfirmedBuildConfig & {
    buildPreset: "codedeploy_bundle";
    appSpecPath: string;
  };
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ec2_asg" }>;
};

type StaticSiteWorkflowInput = {
  confirmedBuildConfig: ConfirmedBuildConfig & {
    buildPreset: "static_export";
    staticOutputPath: string;
    artifactOutputPath: string;
    installPreset: Exclude<ConfirmedBuildConfig["installPreset"], "none">;
  };
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "static_site" }>;
};

function getEcsFargateWorkflowInput(
  input: GitCicdWorkflowRenderInput
): EcsFargateWorkflowInput | null {
  const build = input.confirmedBuildConfig;
  const runtime = input.runtimeConfig;
  if (
    input.runtimeTargetKind !== "ecs_fargate" ||
    !build ||
    build.buildPreset !== "docker_build" ||
    !build.dockerfilePath ||
    runtime?.runtimeTargetKind !== "ecs_fargate"
  ) {
    return null;
  }
  const outputUrl = getRuntimeOutputUrl(runtime);
  return {
    confirmedBuildConfig: {
      ...build,
      buildPreset: "docker_build",
      dockerfilePath: build.dockerfilePath
    },
    runtimeConfig: { ...runtime, outputUrl }
  };
}

function getRuntimeOutputUrl(
  runtimeConfig: ProjectDeploymentRuntimeConfig | null | undefined
): string {
  if (runtimeConfig?.runtimeTargetKind === "ecs_fargate" && !runtimeConfig.outputUrl) {
    throw new Error("DEPLOYMENT_OUTPUT_URL_REQUIRED");
  }

  return runtimeConfig?.outputUrl ?? "";
}

function getLambdaWorkflowInput(input: GitCicdWorkflowRenderInput): LambdaWorkflowInput | null {
  const build = input.confirmedBuildConfig;
  const runtime = input.runtimeConfig;
  if (
    input.runtimeTargetKind !== "lambda" ||
    !build ||
    build.buildPreset !== "sam_build" ||
    !build.samTemplatePath ||
    runtime?.runtimeTargetKind !== "lambda"
  ) {
    return null;
  }
  return {
    confirmedBuildConfig: {
      ...build,
      buildPreset: "sam_build",
      samTemplatePath: build.samTemplatePath
    },
    runtimeConfig: runtime
  };
}

function getEc2AsgWorkflowInput(input: GitCicdWorkflowRenderInput): Ec2AsgWorkflowInput | null {
  const build = input.confirmedBuildConfig;
  const runtime = input.runtimeConfig;
  if (
    input.runtimeTargetKind !== "ec2_asg" ||
    !build ||
    build.buildPreset !== "codedeploy_bundle" ||
    !build.appSpecPath ||
    runtime?.runtimeTargetKind !== "ec2_asg"
  ) {
    return null;
  }
  return {
    confirmedBuildConfig: {
      ...build,
      buildPreset: "codedeploy_bundle",
      appSpecPath: build.appSpecPath
    },
    runtimeConfig: runtime
  };
}

function getStaticSiteWorkflowInput(
  input: GitCicdWorkflowRenderInput
): StaticSiteWorkflowInput | null {
  const build = input.confirmedBuildConfig;
  const runtime = input.runtimeConfig;
  if (
    input.runtimeTargetKind !== "static_site" ||
    !build ||
    build.buildPreset !== "static_export" ||
    build.installPreset === "none" ||
    !build.staticOutputPath ||
    build.artifactOutputPath !== build.staticOutputPath ||
    runtime?.runtimeTargetKind !== "static_site"
  ) {
    return null;
  }
  return {
    confirmedBuildConfig: {
      ...build,
      buildPreset: "static_export",
      installPreset: build.installPreset,
      staticOutputPath: build.staticOutputPath,
      artifactOutputPath: build.staticOutputPath
    },
    runtimeConfig: runtime
  };
}

function renderRuntimeConvergenceEnvironment(input: {
  readonly workflow: GitCicdWorkflowRenderInput;
  readonly adapterKind: string;
  readonly outputUrl: string;
  readonly healthCheckPath: string;
}): string {
  const healthUrl = `${input.outputUrl.replace(/\/+$/u, "")}/${input.healthCheckPath.replace(/^\/+/, "")}`;
  return `  SKETCHCATCH_PROJECT_ID: ${JSON.stringify(input.workflow.projectId ?? "")}
  SKETCHCATCH_AWS_ACCOUNT_ID: ${JSON.stringify(input.workflow.awsAccountId ?? "")}
  SKETCHCATCH_AWS_REGION: ${JSON.stringify(input.workflow.awsRegion ?? "")}
  SKETCHCATCH_RUNTIME_ADAPTER_KIND: ${JSON.stringify(input.adapterKind)}
  SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT: ${JSON.stringify(input.workflow.applicationArtifactFingerprint ?? "")}
  SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT: ${JSON.stringify(input.workflow.deploymentTargetFingerprint ?? "")}
  SKETCHCATCH_HEALTH_URL: ${JSON.stringify(healthUrl)}`;
}

function renderRuntimeConvergenceStep(
  input: GitCicdWorkflowRenderInput,
  adapterKind: string
): string {
  const helperPath = `sketchcatch/${input.projectSlug}/ci-cd/runtime-convergence.sh`;
  return `      - name: Run provider-neutral runtime convergence preflight
        shell: bash
        run: |
          bash ${JSON.stringify(helperPath)} ${JSON.stringify(adapterKind)}`;
}

function renderEcsFargateAppWorkflow(
  input: GitCicdWorkflowRenderInput,
  ecs: EcsFargateWorkflowInput
): string {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const buildspecPath = `sketchcatch/${input.projectSlug}/ci-cd/buildspec-ecs.yml`;

  return `name: SketchCatch App

on:
  workflow_run:
    workflows: ["SketchCatch Infra"]
    types: [completed]
    branches: [${JSON.stringify(input.targetBranch)}]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  SKETCHCATCH_CODEBUILD_PROJECT: \${{ vars.SKETCHCATCH_CODEBUILD_PROJECT }}
  SKETCHCATCH_ECR_REPOSITORY: \${{ vars.SKETCHCATCH_ECR_REPOSITORY }}
  SKETCHCATCH_ECS_CLUSTER: \${{ vars.SKETCHCATCH_ECS_CLUSTER }}
  SKETCHCATCH_ECS_SERVICE: \${{ vars.SKETCHCATCH_ECS_SERVICE }}
  SKETCHCATCH_ECS_CONTAINER: \${{ vars.SKETCHCATCH_ECS_CONTAINER }}
  SKETCHCATCH_OUTPUT_URL: \${{ vars.SKETCHCATCH_OUTPUT_URL }}
  SKETCHCATCH_HEALTH_CHECK_PATH: ${JSON.stringify(ecs.confirmedBuildConfig.healthCheckPath ?? "/")}
  SKETCHCATCH_SOURCE_ROOT: ${JSON.stringify(ecs.confirmedBuildConfig.sourceRoot)}
  SKETCHCATCH_DOCKERFILE_PATH: ${JSON.stringify(ecs.confirmedBuildConfig.dockerfilePath)}
  SKETCHCATCH_BUILDSPEC_PATH: ${JSON.stringify(buildspecPath)}
  SKETCHCATCH_RELEASE_SHA: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}
${renderRuntimeConvergenceEnvironment({
    workflow: input,
    adapterKind: "ecs_service_fargate",
    outputUrl: ecs.runtimeConfig.outputUrl,
    healthCheckPath: ecs.confirmedBuildConfig.healthCheckPath ?? "/"
  })}

jobs:
  release:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == '${input.targetBranch.replaceAll("'", "''")}')
    runs-on: ubuntu-latest
    environment: ${environmentName}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ env.SKETCHCATCH_RELEASE_SHA }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Validate confirmed build config
        shell: bash
        run: |
          set -euo pipefail
          test -n "$SKETCHCATCH_CODEBUILD_PROJECT"
          test -n "$SKETCHCATCH_ECR_REPOSITORY"
          test -n "$SKETCHCATCH_ECS_CLUSTER"
          test -n "$SKETCHCATCH_ECS_SERVICE"
          test -n "$SKETCHCATCH_ECS_CONTAINER"
          test -n "$SKETCHCATCH_OUTPUT_URL"
          test -n "$SKETCHCATCH_HEALTH_CHECK_PATH"
          test -f "$SKETCHCATCH_DOCKERFILE_PATH"
          test -f "$SKETCHCATCH_BUILDSPEC_PATH"
      - name: Run CodeBuild
        shell: bash
        run: |
          set -euo pipefail
          BUILD_ID=$(aws codebuild start-build \\
            --project-name "$SKETCHCATCH_CODEBUILD_PROJECT" \\
            --source-version "$SKETCHCATCH_RELEASE_SHA" \\
            --buildspec-override "$SKETCHCATCH_BUILDSPEC_PATH" \\
            --environment-variables-override \\
              name=SKETCHCATCH_SOURCE_ROOT,value="$SKETCHCATCH_SOURCE_ROOT",type=PLAINTEXT \\
              name=SKETCHCATCH_DOCKERFILE_PATH,value="$SKETCHCATCH_DOCKERFILE_PATH",type=PLAINTEXT \\
              name=SKETCHCATCH_ECR_REPOSITORY,value="$SKETCHCATCH_ECR_REPOSITORY",type=PLAINTEXT \\
              name=SKETCHCATCH_COMMIT_SHA,value="$SKETCHCATCH_RELEASE_SHA",type=PLAINTEXT \\
            --query 'build.id' --output text)
          for attempt in $(seq 1 120); do
            aws codebuild batch-get-builds --ids "$BUILD_ID" --output json > sketchcatch-codebuild.json
            STATUS=$(jq -r '.builds[0].buildStatus' sketchcatch-codebuild.json)
            case "$STATUS" in
              SUCCEEDED) break ;;
              FAILED|FAULT|STOPPED|TIMED_OUT) exit 1 ;;
            esac
            sleep 5
          done
          test "$(jq -r '.builds[0].buildStatus' sketchcatch-codebuild.json)" = "SUCCEEDED"
          IMAGE_DIGEST=$(jq -r '.builds[0].exportedEnvironmentVariables[] | select(.name == "SKETCHCATCH_IMAGE_DIGEST") | .value' sketchcatch-codebuild.json)
          ECR_URI=$(jq -r '.builds[0].exportedEnvironmentVariables[] | select(.name == "SKETCHCATCH_ECR_URI") | .value' sketchcatch-codebuild.json)
          echo "SKETCHCATCH_IMAGE_DIGEST=$IMAGE_DIGEST" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ECR_URI=$ECR_URI" >> "$GITHUB_ENV"
      - name: Publish immutable ECR digest
        shell: bash
        run: |
          set -euo pipefail
          [[ "$SKETCHCATCH_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
          test "$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageDigest="$SKETCHCATCH_IMAGE_DIGEST" --query 'imageDetails[0].imageDigest' --output text)" = "$SKETCHCATCH_IMAGE_DIGEST"
          echo "SKETCHCATCH_IMAGE_URI=$SKETCHCATCH_ECR_URI@$SKETCHCATCH_IMAGE_DIGEST" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_REFERENCE=$SKETCHCATCH_ECR_URI@$SKETCHCATCH_IMAGE_DIGEST" >> "$GITHUB_ENV"
${renderRuntimeConvergenceStep(input, "ecs_service_fargate")}
      - name: Deploy ECS Fargate revision
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set -euo pipefail
          aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > sketchcatch-service-before.json
          FARGATE_SERVICE=$(jq -r '
            (.failures | length) == 0 and (.services | length) == 1 and
            (.services[0] as $s |
             (($s.launchType == "FARGATE") or
              (((($s.capacityProviderStrategy // []) | length) > 0) and
               ([($s.capacityProviderStrategy // [])[]? |
                 select(.capacityProvider != "FARGATE" and .capacityProvider != "FARGATE_SPOT")] |
                length) == 0)))' sketchcatch-service-before.json)
          test "$FARGATE_SERVICE" = true
          PREVIOUS_TASK_DEFINITION=$(jq -r '.services[0].taskDefinition' sketchcatch-service-before.json)
          SKETCHCATCH_DESIRED_COUNT=$(jq -r '.services[0].desiredCount' sketchcatch-service-before.json)
          [[ "$SKETCHCATCH_DESIRED_COUNT" =~ ^[1-9][0-9]*$ ]]
          aws ecs describe-task-definition --task-definition "$PREVIOUS_TASK_DEFINITION" --query 'taskDefinition' --output json > sketchcatch-task-definition.json
          python3 - "$SKETCHCATCH_ECS_CONTAINER" "$SKETCHCATCH_IMAGE_URI" <<'PY'
          import json
          import sys

          container_name, image_uri = sys.argv[1:]
          with open("sketchcatch-task-definition.json", encoding="utf-8") as handle:
              task = json.load(handle)
          for key in ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]:
              task.pop(key, None)
          containers = [item for item in task.get("containerDefinitions", []) if item.get("name") == container_name]
          if len(containers) != 1:
              raise SystemExit("confirmed ECS container was not found exactly once")
          containers[0]["image"] = image_uri
          with open("sketchcatch-task-definition-next.json", "w", encoding="utf-8") as handle:
              json.dump(task, handle)
          PY
          NEW_TASK_DEFINITION=$(aws ecs register-task-definition \
            --cli-input-json file://sketchcatch-task-definition-next.json \
            --tags key=sketchcatch:runtime-convergence,value="sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" \
            --query 'taskDefinition.taskDefinitionArn' --output text)
          echo "SKETCHCATCH_PREVIOUS_TASK_DEFINITION=$PREVIOUS_TASK_DEFINITION" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_NEW_TASK_DEFINITION=$NEW_TASK_DEFINITION" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_DESIRED_COUNT=$SKETCHCATCH_DESIRED_COUNT" >> "$GITHUB_ENV"
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --desired-count 0 \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' >/dev/null
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --task-definition "$NEW_TASK_DEFINITION" \\
            --desired-count "$SKETCHCATCH_DESIRED_COUNT" \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}' \\
            --force-new-deployment >/dev/null
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' >/dev/null
      - name: Verify ECS release
        shell: bash
        run: |
          set -euo pipefail
          aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > sketchcatch-service-after.json
          aws ecs describe-task-definition --task-definition "$SKETCHCATCH_NEW_TASK_DEFINITION" --include TAGS --output json > sketchcatch-task-definition-after.json
          python3 - "$SKETCHCATCH_NEW_TASK_DEFINITION" "$SKETCHCATCH_ECS_CONTAINER" "$SKETCHCATCH_IMAGE_URI" <<'PY'
          import json
          import os
          import sys

          expected_task, container_name, image_uri = sys.argv[1:]
          with open("sketchcatch-service-after.json", encoding="utf-8") as handle:
              service = json.load(handle)["services"][0]
          with open("sketchcatch-task-definition-after.json", encoding="utf-8") as handle:
              task_response = json.load(handle)
          task = task_response["taskDefinition"]
          tags = {item.get("key"): item.get("value") for item in task_response.get("tags", [])}
          marker = "sketchcatch:artifact={};target={}".format(
              os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
              os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"]
          )
          config = service.get("deploymentConfiguration") or {}
          breaker = config.get("deploymentCircuitBreaker") or {}
          desired_count = service.get("desiredCount")
          running_count = service.get("runningCount")
          capacity_providers = service.get("capacityProviderStrategy") or []
          fargate_capacity = service.get("launchType") == "FARGATE" or (
              bool(capacity_providers)
              and all(
                  item.get("capacityProvider") in {"FARGATE", "FARGATE_SPOT"}
                  for item in capacity_providers
              )
          )
          images = [item.get("image") for item in task.get("containerDefinitions", []) if item.get("name") == container_name]
          valid = (
              service.get("taskDefinition") == expected_task
              and service.get("status") == "ACTIVE"
              and fargate_capacity
              and isinstance(desired_count, int)
              and isinstance(running_count, int)
              and desired_count > 0
              and running_count >= 0
              and desired_count == running_count
              and service.get("pendingCount") == 0
              and len(service.get("deployments") or []) == 1
              and config.get("minimumHealthyPercent") == 0
              and config.get("maximumPercent") == 100
              and breaker.get("enable") is True
              and breaker.get("rollback") is True
              and images == [image_uri]
              and tags.get("sketchcatch:runtime-convergence") == marker
          )
          if not valid:
              raise SystemExit("ECS release verification failed")
          PY
          HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
          curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null
          python3 - <<'PY'
          import base64
          import json
          import os
          from datetime import datetime, timezone

          evidence = {
              "schemaVersion": 3,
              "runtimeTargetKind": "ecs_fargate",
              "outcome": "succeeded",
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "imageDigest": os.environ["SKETCHCATCH_IMAGE_DIGEST"],
              "imageUri": os.environ["SKETCHCATCH_IMAGE_URI"],
              "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
              "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
              "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
              "taskDefinitionArn": os.environ["SKETCHCATCH_NEW_TASK_DEFINITION"],
              "previousTaskDefinitionArn": os.environ["SKETCHCATCH_PREVIOUS_TASK_DEFINITION"],
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"],
              "artifact": {
                  "kind": "container_image",
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "buildContractVersion": "application-artifact/v1",
                  "digestAlgorithm": "sha256",
                  "digest": os.environ["SKETCHCATCH_IMAGE_DIGEST"].removeprefix("sha256:"),
                  "location": {
                      "provider": "aws",
                      "accountId": os.environ["SKETCHCATCH_AWS_ACCOUNT_ID"],
                      "region": os.environ["SKETCHCATCH_AWS_REGION"],
                      "storageNamespace": os.environ["SKETCHCATCH_ECR_REPOSITORY"],
                      "artifactReference": os.environ["SKETCHCATCH_IMAGE_URI"],
                      "ownershipScope": "project:" + os.environ["SKETCHCATCH_PROJECT_ID"]
                  }
              },
              "convergence": {
                  "contractVersion": "runtime-convergence/v1",
                  "adapterKind": "ecs_service_fargate",
                  "outcome": os.environ["SKETCHCATCH_CONVERGENCE_OUTCOME"],
                  "deploymentTargetFingerprint": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "artifactDigestAlgorithm": "sha256",
                  "artifactDigest": os.environ["SKETCHCATCH_IMAGE_DIGEST"].removeprefix("sha256:"),
                  "providerStateVerifiedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "fallbackReason": os.environ.get("SKETCHCATCH_CONVERGENCE_FALLBACK_REASON") or None
              }
          }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64={encoded}")
          PY
      - name: Capture ECS rollback evidence
        if: failure() && env.SKETCHCATCH_NEW_TASK_DEFINITION != '' && env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --task-definition "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION" \\
            --desired-count "$SKETCHCATCH_DESIRED_COUNT" \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}' \\
            --force-new-deployment >/dev/null || true
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" || true
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' >/dev/null || true
          CURRENT_TASK_DEFINITION=$(aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
          OUTCOME=failed
          if [ "$CURRENT_TASK_DEFINITION" = "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION" ]; then OUTCOME=rolled_back; fi
          python3 - "$OUTCOME" "$CURRENT_TASK_DEFINITION" <<'PY'
          import base64
          import json
          import os
          import sys

          evidence = {
              "schemaVersion": 1,
              "runtimeTargetKind": "ecs_fargate",
              "outcome": sys.argv[1],
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "imageDigest": os.environ["SKETCHCATCH_IMAGE_DIGEST"],
              "imageUri": os.environ["SKETCHCATCH_IMAGE_URI"],
              "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
              "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
              "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
              "taskDefinitionArn": os.environ["SKETCHCATCH_NEW_TASK_DEFINITION"],
              "previousTaskDefinitionArn": os.environ["SKETCHCATCH_PREVIOUS_TASK_DEFINITION"],
              "restoredTaskDefinitionArn": sys.argv[2],
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
          }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64={encoded}")
          PY
`;
}

function renderLambdaAppWorkflow(
  input: GitCicdWorkflowRenderInput,
  lambda: LambdaWorkflowInput
): string {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const build = lambda.confirmedBuildConfig;
  const runtime = lambda.runtimeConfig;
  return `name: SketchCatch App

on:
  workflow_run:
    workflows: ["SketchCatch Infra"]
    types: [completed]
    branches: [${JSON.stringify(input.targetBranch)}]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: sketchcatch-lambda-${input.projectSlug}-${environmentName}
  cancel-in-progress: false

env:
  SKETCHCATCH_RELEASE_SHA: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}
  SKETCHCATCH_RELEASE_BUCKET: \${{ vars.SKETCHCATCH_RELEASE_BUCKET }}
  SKETCHCATCH_LAMBDA_FUNCTION: \${{ vars.SKETCHCATCH_LAMBDA_FUNCTION }}
  SKETCHCATCH_LAMBDA_ALIAS: \${{ vars.SKETCHCATCH_LAMBDA_ALIAS }}
  SKETCHCATCH_CODEDEPLOY_APPLICATION: \${{ vars.SKETCHCATCH_CODEDEPLOY_APPLICATION }}
  SKETCHCATCH_CODEDEPLOY_GROUP: \${{ vars.SKETCHCATCH_CODEDEPLOY_GROUP }}
  SKETCHCATCH_OUTPUT_URL: \${{ vars.SKETCHCATCH_OUTPUT_URL }}
  SKETCHCATCH_SOURCE_ROOT: ${JSON.stringify(build.sourceRoot)}
  SKETCHCATCH_SAM_TEMPLATE: ${JSON.stringify(build.samTemplatePath)}
  SKETCHCATCH_FUNCTION_LOGICAL_ID: ${JSON.stringify(runtime.functionLogicalId)}
  SKETCHCATCH_HEALTH_CHECK_PATH: ${JSON.stringify(build.healthCheckPath ?? "/")}
${renderRuntimeConvergenceEnvironment({
    workflow: input,
    adapterKind: "lambda_alias",
    outputUrl: runtime.outputUrl,
    healthCheckPath: build.healthCheckPath ?? "/"
  })}

jobs:
  release:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == '${input.targetBranch.replaceAll("'", "''")}')
    runs-on: ubuntu-latest
    environment: ${environmentName}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ env.SKETCHCATCH_RELEASE_SHA }}
      - uses: aws-actions/setup-sam@v2
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Build confirmed SAM application
        shell: bash
        run: |
          set -euo pipefail
          test -n "$SKETCHCATCH_RELEASE_BUCKET"
          test -f "$SKETCHCATCH_SAM_TEMPLATE"
          sam validate --template-file "$SKETCHCATCH_SAM_TEMPLATE"
          sam build --template-file "$SKETCHCATCH_SAM_TEMPLATE"
          FUNCTION_BUILD_DIR=".aws-sam/build/$SKETCHCATCH_FUNCTION_LOGICAL_ID"
          test -d "$FUNCTION_BUILD_DIR"
          (cd "$FUNCTION_BUILD_DIR" && zip -q -r "$GITHUB_WORKSPACE/sketchcatch-lambda.zip" .)
          ARTIFACT_DIGEST=$(sha256sum sketchcatch-lambda.zip | cut -d' ' -f1)
          ARTIFACT_KEY="lambda/$SKETCHCATCH_RELEASE_SHA/$ARTIFACT_DIGEST.zip"
          aws s3 cp sketchcatch-lambda.zip "s3://$SKETCHCATCH_RELEASE_BUCKET/$ARTIFACT_KEY" --only-show-errors
          echo "SKETCHCATCH_ARTIFACT_DIGEST=sha256:$ARTIFACT_DIGEST" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_KEY=$ARTIFACT_KEY" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_URI=s3://$SKETCHCATCH_RELEASE_BUCKET/$ARTIFACT_KEY" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_REFERENCE=s3://$SKETCHCATCH_RELEASE_BUCKET/$ARTIFACT_KEY" >> "$GITHUB_ENV"
${renderRuntimeConvergenceStep(input, "lambda_alias")}
      - name: Publish immutable Lambda version
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set -euo pipefail
          PREVIOUS_VERSION=$(aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --name "$SKETCHCATCH_LAMBDA_ALIAS" --query 'FunctionVersion' --output text)
          test "$PREVIOUS_VERSION" != '$LATEST'
          aws lambda get-function-configuration --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" \
            --output json > sketchcatch-lambda-configuration-before.json
          test "$(jq -r '(.Architectures // []) == ["x86_64"]' sketchcatch-lambda-configuration-before.json)" = true
          test "$(jq -r '(.State == "Active") and (.LastUpdateStatus == "Successful")' sketchcatch-lambda-configuration-before.json)" = true
          aws lambda update-function-code \
            --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" \
            --s3-bucket "$SKETCHCATCH_RELEASE_BUCKET" \
            --s3-key "$SKETCHCATCH_ARTIFACT_KEY" \
            --output json > sketchcatch-lambda-latest.json
          aws lambda wait function-updated-v2 --function-name "$SKETCHCATCH_LAMBDA_FUNCTION"
          CODE_SHA=$(jq -r '.CodeSha256' sketchcatch-lambda-latest.json)
          aws lambda publish-version \
            --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" \
            --code-sha256 "$CODE_SHA" \
            --description "sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" \
            --output json > sketchcatch-lambda-version.json
          PUBLISHED_VERSION=$(jq -r '.Version' sketchcatch-lambda-version.json)
          REMOTE_CODE_SHA=$(jq -r '.CodeSha256' sketchcatch-lambda-version.json | base64 --decode | xxd -p -c 256)
          test "$PUBLISHED_VERSION" != '$LATEST'
          test "sha256:$REMOTE_CODE_SHA" = "$SKETCHCATCH_ARTIFACT_DIGEST"
          echo "SKETCHCATCH_PREVIOUS_VERSION=$PREVIOUS_VERSION" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_PUBLISHED_VERSION=$PUBLISHED_VERSION" >> "$GITHUB_ENV"
      - name: Validate CodeDeploy rollback policy
        shell: bash
        run: |
          set -euo pipefail
          aws deploy get-deployment-group \
            --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
            --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
            --output json > sketchcatch-deployment-group.json
          python3 - <<'PY'
          import json

          with open("sketchcatch-deployment-group.json", encoding="utf-8") as handle:
              group = json.load(handle).get("deploymentGroupInfo") or {}
          rollback = group.get("autoRollbackConfiguration") or {}
          if group.get("deploymentConfigName") != "CodeDeployDefault.LambdaAllAtOnce":
              raise SystemExit("Lambda deployment group must use CodeDeployDefault.LambdaAllAtOnce")
          if rollback.get("enabled") is not True or "DEPLOYMENT_FAILURE" not in (rollback.get("events") or []):
              raise SystemExit("Lambda deployment group must auto-rollback DEPLOYMENT_FAILURE")
          PY
      - name: Create Lambda deployment revision
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set -euo pipefail
          python3 - <<'PY'
          import hashlib
          import json
          import os
          import textwrap

          content = textwrap.dedent("""\\
              version: 0.0
              Resources:
                - TargetFunction:
                    Type: AWS::Lambda::Function
                    Properties:
                      Name: {function_name}
                      Alias: {alias_name}
                      CurrentVersion: {previous_version}
                      TargetVersion: {published_version}
          """).format(
              function_name=os.environ["SKETCHCATCH_LAMBDA_FUNCTION"],
              alias_name=os.environ["SKETCHCATCH_LAMBDA_ALIAS"],
              previous_version=os.environ["SKETCHCATCH_PREVIOUS_VERSION"],
              published_version=os.environ["SKETCHCATCH_PUBLISHED_VERSION"]
          )
          revision = {
              "revisionType": "AppSpecContent",
              "appSpecContent": {
                  "content": content,
                  "sha256": hashlib.sha256(content.encode()).hexdigest()
              }
          }
          with open("sketchcatch-codedeploy-revision.json", "w", encoding="utf-8") as handle:
              json.dump(revision, handle)
          PY
          DEPLOYMENT_ID=$(aws deploy create-deployment \
            --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
            --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
            --deployment-config-name CodeDeployDefault.LambdaAllAtOnce \
            --revision file://sketchcatch-codedeploy-revision.json \
            --query 'deploymentId' --output text)
          echo "SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID=$DEPLOYMENT_ID" >> "$GITHUB_ENV"
      - name: Deploy Lambda alias AllAtOnce
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set +e
          aws deploy wait deployment-successful --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID"
          WAIT_STATUS=$?
          set -e
          echo "SKETCHCATCH_CODEDEPLOY_WAIT_STATUS=$WAIT_STATUS" >> "$GITHUB_ENV"
      - name: Verify Lambda release
        if: always() && (env.SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID != '' || env.SKETCHCATCH_CONVERGENCE_OUTCOME == 'already_active')
        shell: bash
        run: |
          set -euo pipefail
          DEPLOYMENT_STATUS=$(aws deploy get-deployment --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID" --query 'deploymentInfo.status' --output text)
          ACTIVE_VERSION=$(aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --name "$SKETCHCATCH_LAMBDA_ALIAS" --query 'FunctionVersion' --output text)
          if [ "$DEPLOYMENT_STATUS" = "Succeeded" ]; then
            test "$ACTIVE_VERSION" = "$SKETCHCATCH_PUBLISHED_VERSION"
            aws lambda get-function --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --qualifier "$ACTIVE_VERSION" --output json > sketchcatch-lambda-active.json
            test "$(jq -r '.Configuration.Description // empty' sketchcatch-lambda-active.json)" = "sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"
            test "$(jq -r '(.Configuration.Architectures // []) == ["x86_64"]' sketchcatch-lambda-active.json)" = true
            test "$(jq -r '(.Configuration.State == "Active") and (.Configuration.LastUpdateStatus == "Successful")' sketchcatch-lambda-active.json)" = true
            ACTIVE_CODE_SHA=$(jq -r '.Configuration.CodeSha256' sketchcatch-lambda-active.json | base64 --decode | xxd -p -c 256)
            test "sha256:$ACTIVE_CODE_SHA" = "$SKETCHCATCH_ARTIFACT_DIGEST"
            OUTCOME=succeeded
            HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
            if ! curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null; then
              if [ "$SKETCHCATCH_CONVERGENCE_OUTCOME" = already_active ]; then
                OUTCOME=failed
              else
              ALIAS_REVISION_ID=$(aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --name "$SKETCHCATCH_LAMBDA_ALIAS" --query 'RevisionId' --output text)
              aws lambda update-alias \
                --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" \
                --name "$SKETCHCATCH_LAMBDA_ALIAS" \
                --function-version "$SKETCHCATCH_PREVIOUS_VERSION" \
                --revision-id "$ALIAS_REVISION_ID" >/dev/null
              ACTIVE_VERSION=$(aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --name "$SKETCHCATCH_LAMBDA_ALIAS" --query 'FunctionVersion' --output text)
              test "$ACTIVE_VERSION" = "$SKETCHCATCH_PREVIOUS_VERSION"
              OUTCOME=failed
              fi
            fi
          else
            for attempt in $(seq 1 20); do
              ACTIVE_VERSION=$(aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --name "$SKETCHCATCH_LAMBDA_ALIAS" --query 'FunctionVersion' --output text)
              if [ "$ACTIVE_VERSION" = "$SKETCHCATCH_PREVIOUS_VERSION" ]; then break; fi
              sleep 5
            done
            if [ "$ACTIVE_VERSION" = "$SKETCHCATCH_PREVIOUS_VERSION" ]; then OUTCOME=rolled_back; else OUTCOME=failed; fi
          fi
          python3 - "$OUTCOME" "$ACTIVE_VERSION" <<'PY'
          import base64
          import json
          import os
          import sys
          from datetime import datetime, timezone

          evidence = {
              "schemaVersion": 1,
              "runtimeTargetKind": "lambda",
              "outcome": sys.argv[1],
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
              "artifactUri": os.environ["SKETCHCATCH_ARTIFACT_URI"],
              "functionName": os.environ["SKETCHCATCH_LAMBDA_FUNCTION"],
              "aliasName": os.environ["SKETCHCATCH_LAMBDA_ALIAS"],
              "publishedVersion": os.environ["SKETCHCATCH_PUBLISHED_VERSION"],
              "previousVersion": os.environ["SKETCHCATCH_PREVIOUS_VERSION"],
              "activeVersion": sys.argv[2],
              "deploymentId": os.environ["SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID"],
              "deploymentConfigName": "CodeDeployDefault.LambdaAllAtOnce",
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
          }
          if sys.argv[1] == "succeeded":
              evidence["schemaVersion"] = 3
              evidence["artifact"] = {
                  "kind": "lambda_zip",
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "buildContractVersion": "application-artifact/v1",
                  "digestAlgorithm": "sha256",
                  "digest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "location": {
                      "provider": "aws",
                      "accountId": os.environ["SKETCHCATCH_AWS_ACCOUNT_ID"],
                      "region": os.environ["SKETCHCATCH_AWS_REGION"],
                      "storageNamespace": os.environ["SKETCHCATCH_RELEASE_BUCKET"],
                      "artifactReference": os.environ["SKETCHCATCH_ARTIFACT_URI"],
                      "ownershipScope": "project:" + os.environ["SKETCHCATCH_PROJECT_ID"]
                  }
              }
              evidence["convergence"] = {
                  "contractVersion": "runtime-convergence/v1",
                  "adapterKind": "lambda_alias",
                  "outcome": os.environ["SKETCHCATCH_CONVERGENCE_OUTCOME"],
                  "deploymentTargetFingerprint": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "artifactDigestAlgorithm": "sha256",
                  "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "providerStateVerifiedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "fallbackReason": os.environ.get("SKETCHCATCH_CONVERGENCE_FALLBACK_REASON") or None
              }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64={encoded}")
          PY
          test "$OUTCOME" = succeeded
`;
}

function renderEc2AsgAppWorkflow(
  input: GitCicdWorkflowRenderInput,
  ec2Asg: Ec2AsgWorkflowInput
): string {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const build = ec2Asg.confirmedBuildConfig;
  return `name: SketchCatch App

on:
  workflow_run:
    workflows: ["SketchCatch Infra"]
    types: [completed]
    branches: [${JSON.stringify(input.targetBranch)}]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: sketchcatch-ec2-asg-${input.projectSlug}-${environmentName}
  cancel-in-progress: false

env:
  SKETCHCATCH_RELEASE_SHA: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}
  SKETCHCATCH_RELEASE_BUCKET: \${{ vars.SKETCHCATCH_RELEASE_BUCKET }}
  SKETCHCATCH_CODEDEPLOY_APPLICATION: \${{ vars.SKETCHCATCH_CODEDEPLOY_APPLICATION }}
  SKETCHCATCH_CODEDEPLOY_GROUP: \${{ vars.SKETCHCATCH_CODEDEPLOY_GROUP }}
  SKETCHCATCH_ASG_NAME: \${{ vars.SKETCHCATCH_ASG_NAME }}
  SKETCHCATCH_OUTPUT_URL: \${{ vars.SKETCHCATCH_OUTPUT_URL }}
  SKETCHCATCH_SOURCE_ROOT: ${JSON.stringify(build.sourceRoot)}
  SKETCHCATCH_APPSPEC_PATH: ${JSON.stringify(build.appSpecPath)}
  SKETCHCATCH_HEALTH_CHECK_PATH: ${JSON.stringify(build.healthCheckPath ?? "/")}
${renderRuntimeConvergenceEnvironment({
    workflow: input,
    adapterKind: "ec2_auto_scaling_group",
    outputUrl: ec2Asg.runtimeConfig.outputUrl,
    healthCheckPath: build.healthCheckPath ?? "/"
  })}

jobs:
  release:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == '${input.targetBranch.replaceAll("'", "''")}')
    runs-on: ubuntu-latest
    environment: ${environmentName}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ env.SKETCHCATCH_RELEASE_SHA }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Validate CodeDeploy target and rollback baseline
        shell: bash
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "$SKETCHCATCH_RELEASE_SHA"
          test "$(aws s3api get-bucket-versioning --bucket "$SKETCHCATCH_RELEASE_BUCKET" --query Status --output text)" = Enabled
          aws deploy get-deployment-group \
            --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
            --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
            --output json > sketchcatch-deployment-group.json
          python3 - <<'PY'
          import json
          import os

          with open("sketchcatch-deployment-group.json", encoding="utf-8") as handle:
              group = json.load(handle).get("deploymentGroupInfo") or {}
          rollback = group.get("autoRollbackConfiguration") or {}
          asg_names = {item.get("name") for item in (group.get("autoScalingGroups") or [])}
          if group.get("computePlatform") != "Server":
              raise SystemExit("CodeDeploy deployment group must use the Server compute platform")
          if group.get("deploymentConfigName") != "CodeDeployDefault.AllAtOnce":
              raise SystemExit("EC2 deployment group must use CodeDeployDefault.AllAtOnce")
          if asg_names != {os.environ["SKETCHCATCH_ASG_NAME"]}:
              raise SystemExit("CodeDeploy deployment group must target exactly the configured Auto Scaling group")
          if rollback.get("enabled") is not True or "DEPLOYMENT_FAILURE" not in (rollback.get("events") or []):
              raise SystemExit("EC2 deployment group must auto-rollback DEPLOYMENT_FAILURE")
          previous_id = (group.get("lastSuccessfulDeployment") or {}).get("deploymentId")
          if not previous_id:
              raise SystemExit("A previous successful CodeDeploy revision is required as the rollback baseline")
          PY
          PREVIOUS_DEPLOYMENT_ID=$(jq -r '.deploymentGroupInfo.lastSuccessfulDeployment.deploymentId' sketchcatch-deployment-group.json)
          aws deploy get-deployment --deployment-id "$PREVIOUS_DEPLOYMENT_ID" --query 'deploymentInfo.revision' --output json > sketchcatch-previous-revision.json
          python3 - <<'PY'
          import json

          with open("sketchcatch-previous-revision.json", encoding="utf-8") as handle:
              revision = json.load(handle)
          location = revision.get("s3Location") or {}
          if revision.get("revisionType") != "S3" or location.get("bundleType") != "zip":
              raise SystemExit("Previous successful revision must be a versioned S3 ZIP bundle")
          for key in ("bucket", "key", "version"):
              if not location.get(key):
                  raise SystemExit(f"Previous S3 revision is missing {key}")
          PY
          PREVIOUS_BUCKET=$(jq -r '.s3Location.bucket' sketchcatch-previous-revision.json)
          PREVIOUS_KEY=$(jq -r '.s3Location.key' sketchcatch-previous-revision.json)
          PREVIOUS_VERSION_ID=$(jq -r '.s3Location.version' sketchcatch-previous-revision.json)
          echo "SKETCHCATCH_PREVIOUS_ARTIFACT_URI=s3://$PREVIOUS_BUCKET/$PREVIOUS_KEY" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_PREVIOUS_ARTIFACT_VERSION_ID=$PREVIOUS_VERSION_ID" >> "$GITHUB_ENV"
      - name: Build confirmed CodeDeploy bundle
        shell: bash
        run: |
          set -euo pipefail
          APPSPEC_RELATIVE=$(python3 - <<'PY'
          import os
          from pathlib import PurePosixPath

          root = PurePosixPath(os.environ["SKETCHCATCH_SOURCE_ROOT"])
          appspec = PurePosixPath(os.environ["SKETCHCATCH_APPSPEC_PATH"])
          relative = appspec if str(root) == "." else appspec.relative_to(root)
          if len(relative.parts) != 1 or relative.name.lower() not in {"appspec.yml", "appspec.yaml"}:
              raise SystemExit("AppSpec must be at the confirmed source root")
          print(relative.as_posix())
          PY
          )
          test -f "$SKETCHCATCH_SOURCE_ROOT/$APPSPEC_RELATIVE"
          BUNDLE_PATH="$RUNNER_TEMP/sketchcatch-ec2-$SKETCHCATCH_RELEASE_SHA.zip"
          (cd "$SKETCHCATCH_SOURCE_ROOT" && zip -q -X -r "$BUNDLE_PATH" . -x '.git/*')
          ARTIFACT_DIGEST=$(sha256sum "$BUNDLE_PATH" | awk '{print $1}')
          CHECKSUM_SHA256=$(printf '%s' "$ARTIFACT_DIGEST" | xxd -r -p | base64 -w0)
          ARTIFACT_KEY="${input.projectSlug}/ec2-asg/$SKETCHCATCH_RELEASE_SHA/$ARTIFACT_DIGEST.zip"
          echo "SKETCHCATCH_BUNDLE_PATH=$BUNDLE_PATH" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_DIGEST=sha256:$ARTIFACT_DIGEST" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_KEY=$ARTIFACT_KEY" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_CHECKSUM_SHA256=$CHECKSUM_SHA256" >> "$GITHUB_ENV"
${renderRuntimeConvergenceStep(input, "ec2_auto_scaling_group")}
      - name: Publish versioned S3 bundle
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set -euo pipefail
          aws s3api put-object \
            --bucket "$SKETCHCATCH_RELEASE_BUCKET" \
            --key "$SKETCHCATCH_ARTIFACT_KEY" \
            --body "$SKETCHCATCH_BUNDLE_PATH" \
            --checksum-algorithm SHA256 \
            --checksum-sha256 "$SKETCHCATCH_CHECKSUM_SHA256" \
            --output json > sketchcatch-put-object.json
          VERSION_ID=$(jq -r '.VersionId // empty' sketchcatch-put-object.json)
          ETAG=$(jq -r '.ETag // empty' sketchcatch-put-object.json)
          REMOTE_CHECKSUM=$(jq -r '.ChecksumSHA256 // empty' sketchcatch-put-object.json)
          test -n "$VERSION_ID"
          test -n "$ETAG"
          test "$REMOTE_CHECKSUM" = "$SKETCHCATCH_CHECKSUM_SHA256"
          jq -n \
            --arg bucket "$SKETCHCATCH_RELEASE_BUCKET" \
            --arg key "$SKETCHCATCH_ARTIFACT_KEY" \
            --arg version "$VERSION_ID" \
            --arg eTag "$ETAG" \
            '{revisionType:"S3",s3Location:{bucket:$bucket,key:$key,bundleType:"zip",version:$version,eTag:$eTag}}' \
            > sketchcatch-current-revision.json
          echo "SKETCHCATCH_ARTIFACT_URI=s3://$SKETCHCATCH_RELEASE_BUCKET/$SKETCHCATCH_ARTIFACT_KEY" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_VERSION_ID=$VERSION_ID" >> "$GITHUB_ENV"
      - name: Deploy EC2 ASG bundle AllAtOnce
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        shell: bash
        run: |
          set -euo pipefail
          DEPLOYMENT_ID=$(aws deploy create-deployment \
            --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
            --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
            --deployment-config-name CodeDeployDefault.AllAtOnce \
            --description "sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" \
            --revision file://sketchcatch-current-revision.json \
            --query deploymentId --output text)
          echo "SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID=$DEPLOYMENT_ID" >> "$GITHUB_ENV"
          set +e
          aws deploy wait deployment-successful --deployment-id "$DEPLOYMENT_ID"
          WAIT_STATUS=$?
          set -e
          echo "SKETCHCATCH_CODEDEPLOY_WAIT_STATUS=$WAIT_STATUS" >> "$GITHUB_ENV"
      - name: Verify EC2 ASG release and rollback
        if: always() && env.SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID != ''
        shell: bash
        run: |
          set -euo pipefail
          ORIGINAL_STATUS=$(aws deploy get-deployment --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID" --query 'deploymentInfo.status' --output text)
          ACTIVE_DEPLOYMENT_ID="$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID"
          OUTCOME=succeeded
          FAILURE_REASON=""
          restore_previous_revision() {
            aws deploy create-deployment \
              --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
              --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
              --deployment-config-name CodeDeployDefault.AllAtOnce \
              --revision file://sketchcatch-previous-revision.json \
              --description "$1" \
              --query deploymentId --output text
          }
          if [ "$ORIGINAL_STATUS" = Succeeded ]; then
            aws deploy list-deployment-instances --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID" --output json > sketchcatch-original-instances.json
            aws deploy list-deployment-instances --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID" --include-only-statuses Succeeded --output json > sketchcatch-original-succeeded-instances.json
            ORIGINAL_TARGET_COUNT=$(jq '.instancesList | length' sketchcatch-original-instances.json)
            ORIGINAL_SUCCEEDED_COUNT=$(jq '.instancesList | length' sketchcatch-original-succeeded-instances.json)
            if [ "$ORIGINAL_TARGET_COUNT" -eq 0 ] || [ "$ORIGINAL_SUCCEEDED_COUNT" -ne "$ORIGINAL_TARGET_COUNT" ]; then
              if [ "$SKETCHCATCH_CONVERGENCE_OUTCOME" = already_active ]; then
                OUTCOME=failed
                FAILURE_REASON=instance_failure
              else
              ACTIVE_DEPLOYMENT_ID=$(restore_previous_revision "SketchCatch instance-failure rollback")
              set +e
              aws deploy wait deployment-successful --deployment-id "$ACTIVE_DEPLOYMENT_ID"
              set -e
              OUTCOME=failed
              FAILURE_REASON=instance_failure
              fi
            else
              HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
              if ! curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null; then
                if [ "$SKETCHCATCH_CONVERGENCE_OUTCOME" = already_active ]; then
                  OUTCOME=failed
                  FAILURE_REASON=health_check_failure
                else
                ACTIVE_DEPLOYMENT_ID=$(restore_previous_revision "SketchCatch health-check rollback")
                set +e
                aws deploy wait deployment-successful --deployment-id "$ACTIVE_DEPLOYMENT_ID"
                set -e
                OUTCOME=failed
                FAILURE_REASON=health_check_failure
                fi
              fi
            fi
          else
            ROLLBACK_DEPLOYMENT_ID=""
            for attempt in $(seq 1 20); do
              ROLLBACK_DEPLOYMENT_ID=$(aws deploy get-deployment \
                --deployment-id "$SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID" \
                --query 'deploymentInfo.rollbackInfo.rollbackDeploymentId' --output text)
              if [ "$ROLLBACK_DEPLOYMENT_ID" != None ] && [ -n "$ROLLBACK_DEPLOYMENT_ID" ]; then break; fi
              sleep 5
            done
            ACTIVE_DEPLOYMENT_ID="$ROLLBACK_DEPLOYMENT_ID"
            if [ -n "$ACTIVE_DEPLOYMENT_ID" ] && [ "$ACTIVE_DEPLOYMENT_ID" != None ]; then
              set +e
              aws deploy wait deployment-successful --deployment-id "$ACTIVE_DEPLOYMENT_ID"
              set -e
            fi
            OUTCOME=rolled_back
            FAILURE_REASON=codedeploy_failure
          fi
          ACTIVE_STATUS=$(aws deploy get-deployment --deployment-id "$ACTIVE_DEPLOYMENT_ID" --query 'deploymentInfo.status' --output text)
          if [ "$OUTCOME" = succeeded ]; then
            ACTIVE_DESCRIPTION=$(aws deploy get-deployment --deployment-id "$ACTIVE_DEPLOYMENT_ID" --query 'deploymentInfo.description' --output text)
            test "$ACTIVE_DESCRIPTION" = "sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"
          fi
          aws deploy get-deployment --deployment-id "$ACTIVE_DEPLOYMENT_ID" --query 'deploymentInfo.revision' --output json > sketchcatch-active-revision.json
          aws deploy list-deployment-instances --deployment-id "$ACTIVE_DEPLOYMENT_ID" --output json > sketchcatch-all-instances.json
          aws deploy list-deployment-instances --deployment-id "$ACTIVE_DEPLOYMENT_ID" --include-only-statuses Succeeded --output json > sketchcatch-succeeded-instances.json
          TARGET_COUNT=$(jq '.instancesList | length' sketchcatch-all-instances.json)
          SUCCEEDED_COUNT=$(jq '.instancesList | length' sketchcatch-succeeded-instances.json)
          EXPECTED_REVISION=sketchcatch-current-revision.json
          if [ "$OUTCOME" != succeeded ]; then EXPECTED_REVISION=sketchcatch-previous-revision.json; fi
          REVISION_MATCH=$(python3 - "$EXPECTED_REVISION" <<'PY'
          import json
          import sys

          with open(sys.argv[1], encoding="utf-8") as handle:
              expected = json.load(handle).get("s3Location") or {}
          with open("sketchcatch-active-revision.json", encoding="utf-8") as handle:
              active = json.load(handle).get("s3Location") or {}
          fields = ("bucket", "key", "bundleType", "version", "eTag")
          print("1" if all(active.get(field) == expected.get(field) for field in fields) else "0")
          PY
          )
          HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
          HEALTHY=0
          if curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null; then HEALTHY=1; fi
          export ACTIVE_DEPLOYMENT_ID TARGET_COUNT SUCCEEDED_COUNT FAILURE_REASON
          python3 - "$OUTCOME" <<'PY'
          import base64
          import json
          import os
          import sys
          from datetime import datetime, timezone

          evidence = {
              "schemaVersion": 1,
              "runtimeTargetKind": "ec2_asg",
              "outcome": sys.argv[1],
              "failureReason": os.environ["FAILURE_REASON"] or None,
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
              "artifactUri": os.environ["SKETCHCATCH_ARTIFACT_URI"],
              "artifactVersionId": os.environ["SKETCHCATCH_ARTIFACT_VERSION_ID"],
              "previousArtifactUri": os.environ["SKETCHCATCH_PREVIOUS_ARTIFACT_URI"],
              "previousArtifactVersionId": os.environ["SKETCHCATCH_PREVIOUS_ARTIFACT_VERSION_ID"],
              "codeDeployApplicationName": os.environ["SKETCHCATCH_CODEDEPLOY_APPLICATION"],
              "codeDeployDeploymentGroupName": os.environ["SKETCHCATCH_CODEDEPLOY_GROUP"],
              "autoScalingGroupName": os.environ["SKETCHCATCH_ASG_NAME"],
              "deploymentId": os.environ["SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID"],
              "activeDeploymentId": os.environ["ACTIVE_DEPLOYMENT_ID"],
              "deploymentConfigName": "CodeDeployDefault.AllAtOnce",
              "targetInstanceCount": int(os.environ["TARGET_COUNT"]),
              "succeededInstanceCount": int(os.environ["SUCCEEDED_COUNT"]),
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
          }
          if sys.argv[1] == "succeeded":
              evidence["schemaVersion"] = 3
              evidence["artifact"] = {
                  "kind": "codedeploy_bundle",
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "buildContractVersion": "application-artifact/v1",
                  "digestAlgorithm": "sha256",
                  "digest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "location": {
                      "provider": "aws",
                      "accountId": os.environ["SKETCHCATCH_AWS_ACCOUNT_ID"],
                      "region": os.environ["SKETCHCATCH_AWS_REGION"],
                      "storageNamespace": os.environ["SKETCHCATCH_RELEASE_BUCKET"],
                      "artifactReference": os.environ["SKETCHCATCH_ARTIFACT_URI"],
                      "ownershipScope": "project:" + os.environ["SKETCHCATCH_PROJECT_ID"]
                  }
              }
              evidence["convergence"] = {
                  "contractVersion": "runtime-convergence/v1",
                  "adapterKind": "ec2_auto_scaling_group",
                  "outcome": os.environ["SKETCHCATCH_CONVERGENCE_OUTCOME"],
                  "deploymentTargetFingerprint": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "artifactDigestAlgorithm": "sha256",
                  "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "providerStateVerifiedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "fallbackReason": os.environ.get("SKETCHCATCH_CONVERGENCE_FALLBACK_REASON") or None
              }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_EC2_RELEASE_EVIDENCE_B64={encoded}")
          PY
          test "$ACTIVE_STATUS" = Succeeded
          test "$TARGET_COUNT" -gt 0
          test "$SUCCEEDED_COUNT" -eq "$TARGET_COUNT"
          test "$REVISION_MATCH" = 1
          test "$HEALTHY" = 1
          test "$OUTCOME" = succeeded
`;
}

function renderStaticSiteAppWorkflow(
  input: GitCicdWorkflowRenderInput,
  staticSite: StaticSiteWorkflowInput
): string {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const build = staticSite.confirmedBuildConfig;
  return `name: SketchCatch App

on:
  workflow_run:
    workflows: ["SketchCatch Infra"]
    types: [completed]
    branches: [${JSON.stringify(input.targetBranch)}]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: sketchcatch-static-${input.projectSlug}-${environmentName}
  cancel-in-progress: false

env:
  SKETCHCATCH_RELEASE_SHA: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}
  SKETCHCATCH_STATIC_BUCKET: \${{ vars.SKETCHCATCH_STATIC_BUCKET }}
  SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID: \${{ vars.SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID }}
  SKETCHCATCH_CLOUDFRONT_ORIGIN_ID: \${{ vars.SKETCHCATCH_CLOUDFRONT_ORIGIN_ID }}
  SKETCHCATCH_OUTPUT_URL: \${{ vars.SKETCHCATCH_OUTPUT_URL }}
  SKETCHCATCH_SOURCE_ROOT: ${JSON.stringify(build.sourceRoot)}
  SKETCHCATCH_STATIC_OUTPUT_PATH: ${JSON.stringify(build.staticOutputPath)}
  SKETCHCATCH_INSTALL_PRESET: ${JSON.stringify(build.installPreset)}
${renderRuntimeConvergenceEnvironment({
    workflow: input,
    adapterKind: "static_s3_cloudfront",
    outputUrl: staticSite.runtimeConfig.outputUrl,
    healthCheckPath: build.healthCheckPath ?? "/"
  })}

jobs:
  release:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == '${input.targetBranch.replaceAll("'", "''")}')
    runs-on: ubuntu-latest
    environment: ${environmentName}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ env.SKETCHCATCH_RELEASE_SHA }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Build confirmed static output
        id: build
        shell: bash
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "$SKETCHCATCH_RELEASE_SHA"
          test -f "$SKETCHCATCH_SOURCE_ROOT/package.json"
          case "$SKETCHCATCH_INSTALL_PRESET" in
            pnpm_frozen_lockfile)
              test -f pnpm-lock.yaml
              corepack enable
              pnpm install --frozen-lockfile
              pnpm --dir "$SKETCHCATCH_SOURCE_ROOT" build
              ;;
            npm_ci)
              test -f "$SKETCHCATCH_SOURCE_ROOT/package-lock.json"
              npm --prefix "$SKETCHCATCH_SOURCE_ROOT" ci
              npm --prefix "$SKETCHCATCH_SOURCE_ROOT" run build
              ;;
            yarn_frozen_lockfile)
              test -f "$SKETCHCATCH_SOURCE_ROOT/yarn.lock"
              corepack enable
              yarn --cwd "$SKETCHCATCH_SOURCE_ROOT" install --frozen-lockfile
              yarn --cwd "$SKETCHCATCH_SOURCE_ROOT" build
              ;;
            *)
              echo "A confirmed lockfile install preset is required." >&2
              exit 1
              ;;
          esac
          REPOSITORY_ROOT=$(pwd -P)
          SOURCE_ROOT=$(realpath -e "$SKETCHCATCH_SOURCE_ROOT")
          OUTPUT_ROOT=$(realpath -e "$SKETCHCATCH_STATIC_OUTPUT_PATH")
          case "$SOURCE_ROOT/" in "$REPOSITORY_ROOT/"*) ;; *) exit 1 ;; esac
          case "$OUTPUT_ROOT/" in "$SOURCE_ROOT/"*) ;; *) exit 1 ;; esac
          test -f "$OUTPUT_ROOT/index.html"
          FILE_COUNT=$(python3 - "$OUTPUT_ROOT" <<'PY'
          import hashlib
          import json
          import os
          from pathlib import Path
          import sys

          root = Path(sys.argv[1]).resolve(strict=True)
          entries = []
          for candidate in sorted(root.rglob("*")):
              if candidate.is_symlink():
                  raise SystemExit("Static output must not contain symbolic links")
              if not candidate.is_file():
                  continue
              relative = candidate.relative_to(root).as_posix()
              if len(relative) > 1024:
                  raise SystemExit("Static output contains a path longer than 1024 characters")
              digest_builder = hashlib.sha256()
              with candidate.open("rb") as handle:
                  for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                      digest_builder.update(chunk)
              digest = digest_builder.hexdigest()
              entries.append({"path": relative, "size": candidate.stat().st_size, "sha256": digest})
          if not 1 <= len(entries) <= 10000:
              raise SystemExit("Static output must contain between 1 and 10000 files")
          manifest = {
              "schemaVersion": 1,
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "files": entries,
          }
          with open("sketchcatch-static-manifest.json", "w", encoding="utf-8") as handle:
              json.dump(manifest, handle, sort_keys=True, separators=(",", ":"))
              handle.write("\\n")
          print(len(entries))
          PY
          )
          ARTIFACT_HASH=$(sha256sum sketchcatch-static-manifest.json | cut -d' ' -f1)
          RELEASE_PREFIX="releases/$SKETCHCATCH_RELEASE_SHA/$ARTIFACT_HASH"
          echo "SKETCHCATCH_OUTPUT_ROOT=$OUTPUT_ROOT" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_FILE_COUNT=$FILE_COUNT" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_ARTIFACT_DIGEST=sha256:$ARTIFACT_HASH" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_RELEASE_PREFIX=$RELEASE_PREFIX" >> "$GITHUB_ENV"
${renderRuntimeConvergenceStep(input, "static_s3_cloudfront")}
      - name: Publish versioned static release
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        id: publish
        shell: bash
        run: |
          set -euo pipefail
          test "$(aws s3api get-bucket-versioning --bucket "$SKETCHCATCH_STATIC_BUCKET" --query Status --output text)" = Enabled
          EXISTING_COUNT=$(aws s3api list-objects-v2 --bucket "$SKETCHCATCH_STATIC_BUCKET" --prefix "$SKETCHCATCH_RELEASE_PREFIX/" --max-keys 1 --query KeyCount --output text)
          if [ "$EXISTING_COUNT" = 0 ]; then
            aws s3 sync "$SKETCHCATCH_OUTPUT_ROOT" "s3://$SKETCHCATCH_STATIC_BUCKET/$SKETCHCATCH_RELEASE_PREFIX/" --checksum-algorithm SHA256 --only-show-errors
            MANIFEST_CHECKSUM=$(openssl dgst -sha256 -binary sketchcatch-static-manifest.json | openssl base64 -A)
            aws s3api put-object \
              --bucket "$SKETCHCATCH_STATIC_BUCKET" \
              --key "$SKETCHCATCH_RELEASE_PREFIX/.sketchcatch-release-manifest.json" \
              --body sketchcatch-static-manifest.json \
              --content-type application/json \
              --checksum-algorithm SHA256 \
              --checksum-sha256 "$MANIFEST_CHECKSUM" \
              --output json > sketchcatch-manifest-put.json
            MANIFEST_VERSION_ID=$(jq -r '.VersionId // empty' sketchcatch-manifest-put.json)
            test -n "$MANIFEST_VERSION_ID"
            test "$(jq -r '.ChecksumSHA256 // empty' sketchcatch-manifest-put.json)" = "$MANIFEST_CHECKSUM"
          else
            aws s3api get-object \
              --bucket "$SKETCHCATCH_STATIC_BUCKET" \
              --key "$SKETCHCATCH_RELEASE_PREFIX/.sketchcatch-release-manifest.json" \
              --checksum-mode ENABLED \
              "$RUNNER_TEMP/sketchcatch-existing-static-manifest.json" \
              > sketchcatch-existing-manifest-response.json
            cmp --silent sketchcatch-static-manifest.json "$RUNNER_TEMP/sketchcatch-existing-static-manifest.json"
            MANIFEST_VERSION_ID=$(jq -r '.VersionId // empty' sketchcatch-existing-manifest-response.json)
            test -n "$MANIFEST_VERSION_ID"
            aws s3api list-objects-v2 \
              --bucket "$SKETCHCATCH_STATIC_BUCKET" \
              --prefix "$SKETCHCATCH_RELEASE_PREFIX/" \
              --max-items 10001 --output json > sketchcatch-existing-release-objects.json
            test "$(jq -r '.NextToken // empty' sketchcatch-existing-release-objects.json)" = ""
            EXISTING_OBJECT_COUNT=$(jq '.Contents | length' sketchcatch-existing-release-objects.json)
            test "$EXISTING_OBJECT_COUNT" -eq "$((SKETCHCATCH_FILE_COUNT + 1))"
            echo "SKETCHCATCH_STATIC_ARTIFACT_ALREADY_PRESENT=1" >> "$GITHUB_ENV"
          fi
          echo "SKETCHCATCH_MANIFEST_URI=s3://$SKETCHCATCH_STATIC_BUCKET/$SKETCHCATCH_RELEASE_PREFIX/.sketchcatch-release-manifest.json" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_MANIFEST_VERSION_ID=$MANIFEST_VERSION_ID" >> "$GITHUB_ENV"
      - name: Switch CloudFront release pointer
        if: env.SKETCHCATCH_CONVERGENCE_OUTCOME != 'already_active'
        id: switch
        continue-on-error: true
        shell: bash
        run: |
          set -euo pipefail
          echo "SKETCHCATCH_SWITCH_FAILURE_REASON=distribution_update_failure" >> "$GITHUB_ENV"
          aws cloudfront get-distribution-config --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" --output json > sketchcatch-distribution-before.json
          python3 - <<'PY'
          import json
          import os
          import re

          with open("sketchcatch-distribution-before.json", encoding="utf-8") as handle:
              response = json.load(handle)
          config = response.get("DistributionConfig") or {}
          if not config.get("Enabled"):
              raise SystemExit("CloudFront distribution must be enabled")
          origins = (config.get("Origins") or {}).get("Items") or []
          matches = [item for item in origins if item.get("Id") == os.environ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID"]]
          if len(matches) != 1:
              raise SystemExit("Configured CloudFront origin was not found exactly once")
          origin = matches[0]
          bucket = os.environ["SKETCHCATCH_STATIC_BUCKET"]
          domain = str(origin.get("DomainName") or "").lower().rstrip(".")
          allowed_suffix = domain.endswith(".amazonaws.com") or domain.endswith(".amazonaws.com.cn")
          allowed = domain in {f"{bucket}.s3.amazonaws.com", f"{bucket}.s3.amazonaws.com.cn"} or (
              domain.startswith(f"{bucket}.s3.") and allowed_suffix
          )
          if not allowed or "S3OriginConfig" not in origin:
              raise SystemExit("CloudFront origin must be the configured S3 bucket")
          previous = str(origin.get("OriginPath") or "")
          if previous:
              segments = previous[1:].split("/") if previous.startswith("/") else []
              safe_segment = re.compile(r"^[A-Za-z0-9._~!$&'()*+,;=:@%-]+$")
              if (
                  len(previous) > 512
                  or not segments
                  or any(segment in {"", ".", ".."} or not safe_segment.fullmatch(segment) for segment in segments)
              ):
                  raise SystemExit("CloudFront origin path is not a safe rollback baseline")
          marker_names = {
              "artifact": "X-SketchCatch-Artifact-Fingerprint",
              "target": "X-SketchCatch-Deployment-Target-Fingerprint",
          }
          custom_headers = origin.get("CustomHeaders") or {}
          header_items = custom_headers.get("Items") or []
          previous_markers = {
              key: next(
                  (
                      str(item.get("HeaderValue") or "")
                      for item in header_items
                      if str(item.get("HeaderName") or "").lower() == name.lower()
                  ),
                  None,
              )
              for key, name in marker_names.items()
          }
          retained_headers = [
              item
              for item in header_items
              if str(item.get("HeaderName") or "").lower()
              not in {name.lower() for name in marker_names.values()}
          ]
          retained_headers.extend([
              {
                  "HeaderName": marker_names["artifact"],
                  "HeaderValue": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
              },
              {
                  "HeaderName": marker_names["target"],
                  "HeaderValue": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
              },
          ])
          origin["CustomHeaders"] = {
              "Quantity": len(retained_headers),
              "Items": retained_headers,
          }
          origin["OriginPath"] = "/" + os.environ["SKETCHCATCH_RELEASE_PREFIX"]
          with open("sketchcatch-distribution-update.json", "w", encoding="utf-8") as handle:
              json.dump(config, handle, separators=(",", ":"))
          with open("sketchcatch-previous-origin-path.txt", "w", encoding="utf-8") as handle:
              handle.write(previous)
          with open("sketchcatch-previous-convergence-headers.json", "w", encoding="utf-8") as handle:
              json.dump(previous_markers, handle, separators=(",", ":"))
          PY
          PREVIOUS_ORIGIN_PATH=$(cat sketchcatch-previous-origin-path.txt)
          ETAG=$(jq -r '.ETag // empty' sketchcatch-distribution-before.json)
          test -n "$ETAG"
          echo "SKETCHCATCH_PREVIOUS_ORIGIN_PATH=$PREVIOUS_ORIGIN_PATH" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_PREVIOUS_RELEASE_PREFIX=\${PREVIOUS_ORIGIN_PATH#/}" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_BASELINE_CAPTURED=1" >> "$GITHUB_ENV"
          aws cloudfront update-distribution \
            --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
            --if-match "$ETAG" \
            --distribution-config file://sketchcatch-distribution-update.json \
            --output json > sketchcatch-distribution-update-result.json
          aws cloudfront wait distribution-deployed --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID"
          echo "SKETCHCATCH_SWITCH_FAILURE_REASON=invalidation_failure" >> "$GITHUB_ENV"
          INVALIDATION_ID=$(aws cloudfront create-invalidation \
            --distribution-id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
            --paths '/*' --query 'Invalidation.Id' --output text)
          echo "SKETCHCATCH_INVALIDATION_ID=$INVALIDATION_ID" >> "$GITHUB_ENV"
          aws cloudfront wait invalidation-completed \
            --distribution-id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
            --id "$INVALIDATION_ID"
          echo "SKETCHCATCH_SWITCH_FAILURE_REASON=" >> "$GITHUB_ENV"
      - name: Verify static release and rollback
        if: always() && (steps.publish.outcome == 'success' || env.SKETCHCATCH_CONVERGENCE_OUTCOME == 'already_active')
        shell: bash
        env:
          SKETCHCATCH_SWITCH_OUTCOME: \${{ steps.switch.outcome }}
        run: |
          set -euo pipefail
          OUTCOME=succeeded
          FAILURE_REASON=""
          ACTIVE_INVALIDATION_ID="\${SKETCHCATCH_INVALIDATION_ID:-}"
          if [ "$SKETCHCATCH_CONVERGENCE_OUTCOME" = already_active ]; then
            OUTCOME=succeeded
          elif [ "$SKETCHCATCH_SWITCH_OUTCOME" != success ]; then
            OUTCOME=failed
            FAILURE_REASON="\${SKETCHCATCH_SWITCH_FAILURE_REASON:-distribution_update_failure}"
          elif ! curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$SKETCHCATCH_OUTPUT_URL" >/dev/null; then
            OUTCOME=failed
            FAILURE_REASON=health_check_failure
          fi
          if [ "$OUTCOME" != succeeded ]; then
            if [ "\${SKETCHCATCH_BASELINE_CAPTURED:-0}" != 1 ]; then
              echo "CloudFront rollback baseline was not captured; refusing to mutate the distribution." >&2
              exit 1
            fi
            set +e
            aws cloudfront wait distribution-deployed --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID"
            set -e
            aws cloudfront get-distribution-config --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" --output json > sketchcatch-distribution-rollback.json
            python3 - <<'PY'
          import json
          import os

          with open("sketchcatch-distribution-rollback.json", encoding="utf-8") as handle:
              response = json.load(handle)
          config = response.get("DistributionConfig") or {}
          origins = (config.get("Origins") or {}).get("Items") or []
          matches = [item for item in origins if item.get("Id") == os.environ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID"]]
          if len(matches) != 1:
              raise SystemExit("Configured CloudFront origin was not found during rollback")
          origin = matches[0]
          previous = os.environ.get("SKETCHCATCH_PREVIOUS_ORIGIN_PATH", "")
          current = str(origin.get("OriginPath") or "")
          attempted = "/" + os.environ["SKETCHCATCH_RELEASE_PREFIX"]
          if current not in {previous, attempted}:
              raise SystemExit("CloudFront origin changed outside this release; refusing rollback")
          marker_names = {
              "artifact": "X-SketchCatch-Artifact-Fingerprint",
              "target": "X-SketchCatch-Deployment-Target-Fingerprint",
          }
          with open("sketchcatch-previous-convergence-headers.json", encoding="utf-8") as handle:
              previous_markers = json.load(handle)
          custom_headers = origin.get("CustomHeaders") or {}
          header_items = custom_headers.get("Items") or []
          current_markers = {
              key: next(
                  (
                      str(item.get("HeaderValue") or "")
                      for item in header_items
                      if str(item.get("HeaderName") or "").lower() == name.lower()
                  ),
                  None,
              )
              for key, name in marker_names.items()
          }
          attempted_markers = {
              "artifact": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
              "target": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
          }
          if current_markers not in (previous_markers, attempted_markers):
              raise SystemExit("CloudFront convergence marker changed outside this release; refusing rollback")
          retained_headers = [
              item
              for item in header_items
              if str(item.get("HeaderName") or "").lower()
              not in {name.lower() for name in marker_names.values()}
          ]
          for key, name in marker_names.items():
              value = previous_markers.get(key)
              if value:
                  retained_headers.append({"HeaderName": name, "HeaderValue": value})
          origin["CustomHeaders"] = {"Quantity": len(retained_headers)}
          if retained_headers:
              origin["CustomHeaders"]["Items"] = retained_headers
          needed = current != previous or current_markers != previous_markers
          origin["OriginPath"] = previous
          with open("sketchcatch-distribution-rollback-update.json", "w", encoding="utf-8") as handle:
              json.dump(config, handle, separators=(",", ":"))
          with open("sketchcatch-rollback-needed.txt", "w", encoding="utf-8") as handle:
              handle.write("1" if needed else "0")
          PY
            if [ "$(cat sketchcatch-rollback-needed.txt)" = 1 ]; then
              ROLLBACK_ETAG=$(jq -r '.ETag // empty' sketchcatch-distribution-rollback.json)
              aws cloudfront update-distribution \
                --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
                --if-match "$ROLLBACK_ETAG" \
                --distribution-config file://sketchcatch-distribution-rollback-update.json >/dev/null
              aws cloudfront wait distribution-deployed --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID"
              ACTIVE_INVALIDATION_ID=$(aws cloudfront create-invalidation \
                --distribution-id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
                --paths '/*' --query 'Invalidation.Id' --output text)
              aws cloudfront wait invalidation-completed \
                --distribution-id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
                --id "$ACTIVE_INVALIDATION_ID"
            fi
          fi
          aws s3api head-object \
            --bucket "$SKETCHCATCH_STATIC_BUCKET" \
            --key "$SKETCHCATCH_RELEASE_PREFIX/.sketchcatch-release-manifest.json" \
            --version-id "$SKETCHCATCH_MANIFEST_VERSION_ID" \
            --checksum-mode ENABLED --output json > sketchcatch-manifest-head.json
          aws cloudfront get-distribution-config --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" --output json > sketchcatch-distribution-active.json
          DISTRIBUTION_STATUS=$(aws cloudfront get-distribution --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" --query 'Distribution.Status' --output text)
          INVALIDATION_STATUS=""
          if [ -n "$ACTIVE_INVALIDATION_ID" ]; then
            INVALIDATION_STATUS=$(aws cloudfront get-invalidation \
              --distribution-id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
              --id "$ACTIVE_INVALIDATION_ID" --query 'Invalidation.Status' --output text)
          fi
          ACTIVE_ORIGIN_PATH=$(python3 - <<'PY'
          import json
          import os

          with open("sketchcatch-distribution-active.json", encoding="utf-8") as handle:
              config = (json.load(handle).get("DistributionConfig") or {})
          origins = (config.get("Origins") or {}).get("Items") or []
          matches = [item for item in origins if item.get("Id") == os.environ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID"]]
          if len(matches) != 1:
              raise SystemExit("Configured CloudFront origin was not found after release")
          print(str(matches[0].get("OriginPath") or ""))
          PY
          )
          ACTIVE_RELEASE_PREFIX="\${ACTIVE_ORIGIN_PATH#/}"
          ACTIVE_ARTIFACT_FINGERPRINT=$(jq -r --arg origin "$SKETCHCATCH_CLOUDFRONT_ORIGIN_ID" '
            [.DistributionConfig.Origins.Items[]? | select(.Id == $origin) |
             .CustomHeaders.Items[]? | select((.HeaderName | ascii_downcase) == "x-sketchcatch-artifact-fingerprint") |
             .HeaderValue][0] // empty' sketchcatch-distribution-active.json)
          ACTIVE_TARGET_FINGERPRINT=$(jq -r --arg origin "$SKETCHCATCH_CLOUDFRONT_ORIGIN_ID" '
            [.DistributionConfig.Origins.Items[]? | select(.Id == $origin) |
             .CustomHeaders.Items[]? | select((.HeaderName | ascii_downcase) == "x-sketchcatch-deployment-target-fingerprint") |
             .HeaderValue][0] // empty' sketchcatch-distribution-active.json)
          EXPECTED_PREFIX="$SKETCHCATCH_RELEASE_PREFIX"
          if [ "$OUTCOME" != succeeded ]; then EXPECTED_PREFIX="\${SKETCHCATCH_PREVIOUS_ORIGIN_PATH#/}"; fi
          HEALTHY=0
          if curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$SKETCHCATCH_OUTPUT_URL" >/dev/null; then HEALTHY=1; fi
          DISTRIBUTION_ETAG=$(jq -r '.ETag // empty' sketchcatch-distribution-active.json)
          export OUTCOME FAILURE_REASON ACTIVE_INVALIDATION_ID ACTIVE_RELEASE_PREFIX DISTRIBUTION_ETAG
          python3 - <<'PY'
          import base64
          import json
          import os
          from datetime import datetime, timezone

          evidence = {
              "schemaVersion": 1,
              "runtimeTargetKind": "static_site",
              "outcome": os.environ["OUTCOME"],
              "failureReason": os.environ["FAILURE_REASON"] or None,
              "commitSha": os.environ["SKETCHCATCH_RELEASE_SHA"],
              "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
              "manifestUri": os.environ["SKETCHCATCH_MANIFEST_URI"],
              "manifestVersionId": os.environ["SKETCHCATCH_MANIFEST_VERSION_ID"],
              "releasePrefix": os.environ["SKETCHCATCH_RELEASE_PREFIX"],
              "previousReleasePrefix": os.environ.get("SKETCHCATCH_PREVIOUS_RELEASE_PREFIX", ""),
              "activeReleasePrefix": os.environ["ACTIVE_RELEASE_PREFIX"],
              "hostingBucketName": os.environ["SKETCHCATCH_STATIC_BUCKET"],
              "cloudFrontDistributionId": os.environ["SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID"],
              "cloudFrontOriginId": os.environ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID"],
              "distributionEtag": os.environ["DISTRIBUTION_ETAG"],
              "invalidationId": os.environ["ACTIVE_INVALIDATION_ID"] or None,
              "fileCount": int(os.environ["SKETCHCATCH_FILE_COUNT"]),
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"],
          }
          if os.environ["OUTCOME"] == "succeeded":
              evidence["schemaVersion"] = 3
              evidence["artifact"] = {
                  "kind": "static_bundle",
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "buildContractVersion": "application-artifact/v1",
                  "digestAlgorithm": "sha256",
                  "digest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "location": {
                      "provider": "aws",
                      "accountId": os.environ["SKETCHCATCH_AWS_ACCOUNT_ID"],
                      "region": os.environ["SKETCHCATCH_AWS_REGION"],
                      "storageNamespace": os.environ["SKETCHCATCH_STATIC_BUCKET"],
                      "artifactReference": os.environ["SKETCHCATCH_MANIFEST_URI"],
                      "ownershipScope": "project:" + os.environ["SKETCHCATCH_PROJECT_ID"]
                  }
              }
              evidence["convergence"] = {
                  "contractVersion": "runtime-convergence/v1",
                  "adapterKind": "static_s3_cloudfront",
                  "outcome": os.environ["SKETCHCATCH_CONVERGENCE_OUTCOME"],
                  "deploymentTargetFingerprint": os.environ["SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"],
                  "artifactFingerprint": os.environ["SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"],
                  "artifactDigestAlgorithm": "sha256",
                  "artifactDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"].removeprefix("sha256:"),
                  "providerStateVerifiedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                  "fallbackReason": os.environ.get("SKETCHCATCH_CONVERGENCE_FALLBACK_REASON") or None
              }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_STATIC_RELEASE_EVIDENCE_B64={encoded}")
          PY
          test "$DISTRIBUTION_STATUS" = Deployed
          if [ -n "$ACTIVE_INVALIDATION_ID" ]; then test "$INVALIDATION_STATUS" = Completed; fi
          test "$ACTIVE_RELEASE_PREFIX" = "$EXPECTED_PREFIX"
          test "$ACTIVE_ARTIFACT_FINGERPRINT" = "$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT"
          test "$ACTIVE_TARGET_FINGERPRINT" = "$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"
          test "$HEALTHY" = 1
          test "$OUTCOME" = succeeded
`;
}

function renderRuntimeConvergenceScript(): string {
  return `#!/usr/bin/env bash
set -uo pipefail

ADAPTER="\${1:-}"
OUTCOME=rolled_out
FALLBACK_REASON=current_state_unavailable
MARKER="sketchcatch:artifact=$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT;target=$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT"

write_env() {
  echo "SKETCHCATCH_CONVERGENCE_OUTCOME=$OUTCOME" >> "$GITHUB_ENV"
  echo "SKETCHCATCH_CONVERGENCE_FALLBACK_REASON=$FALLBACK_REASON" >> "$GITHUB_ENV"
}

target_mismatch() { FALLBACK_REASON=target_mismatch; write_env; exit 0; }
artifact_identity_mismatch() { FALLBACK_REASON=artifact_fingerprint_mismatch; write_env; exit 0; }
artifact_digest_mismatch() { FALLBACK_REASON=artifact_digest_mismatch; write_env; exit 0; }
unhealthy() { FALLBACK_REASON=unhealthy; write_env; exit 0; }

if [[ ! "$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT" =~ ^[0-9a-f]{64}$ ]] ||
   [[ ! "$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" =~ ^[0-9a-f]{64}$ ]] ||
   [[ ! "$SKETCHCATCH_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  write_env
  exit 0
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
  write_env
  exit 0
}
if [ "$ACCOUNT_ID" != "$SKETCHCATCH_AWS_ACCOUNT_ID" ]; then target_mismatch; fi
if [ "\${AWS_REGION:-\${AWS_DEFAULT_REGION:-}}" != "$SKETCHCATCH_AWS_REGION" ]; then
  target_mismatch
fi

case "$ADAPTER" in
  ecs_service_fargate)
    aws ecs describe-services \
      --cluster "$SKETCHCATCH_ECS_CLUSTER" \
      --services "$SKETCHCATCH_ECS_SERVICE" \
      --output json > sketchcatch-convergence-service.json 2>/dev/null || { write_env; exit 0; }
    TASK_DEFINITION=$(jq -r '.services[0].taskDefinition // empty' sketchcatch-convergence-service.json)
    [ -n "$TASK_DEFINITION" ] || target_mismatch
    aws ecs describe-task-definition --task-definition "$TASK_DEFINITION" --include TAGS \
      --output json > sketchcatch-convergence-task.json 2>/dev/null || { write_env; exit 0; }
    SERVICE_TARGET=$(jq -r --arg cluster "$SKETCHCATCH_ECS_CLUSTER" --arg service "$SKETCHCATCH_ECS_SERVICE" '
      (.failures | length) == 0 and (.services | length) == 1 and
      (.services[0].serviceName == $service) and
      ((.services[0].clusterArn | split("/")[-1]) == $cluster)' sketchcatch-convergence-service.json)
    [ "$SERVICE_TARGET" = true ] || target_mismatch
    CURRENT_MARKER=$(jq -r '[.tags[]? | select(.key == "sketchcatch:runtime-convergence") | .value][0] // empty' sketchcatch-convergence-task.json)
    [ "$CURRENT_MARKER" = "$MARKER" ] || artifact_identity_mismatch
    CURRENT_IMAGE=$(jq -r --arg name "$SKETCHCATCH_ECS_CONTAINER" '[.taskDefinition.containerDefinitions[]? | select(.name == $name) | .image][0] // empty' sketchcatch-convergence-task.json)
    [ "$CURRENT_IMAGE" = "$SKETCHCATCH_ARTIFACT_REFERENCE" ] || artifact_digest_mismatch
    HEALTHY=$(jq -r '
      .services[0] as $s |
      ($s.status == "ACTIVE") and ($s.desiredCount > 0) and
      ($s.runningCount == $s.desiredCount) and ($s.pendingCount == 0) and
      (($s.deployments | length) == 1) and
      (($s.launchType == "FARGATE") or
       (((($s.capacityProviderStrategy // []) | length) > 0) and
        ([($s.capacityProviderStrategy // [])[]? |
          select(.capacityProvider != "FARGATE" and .capacityProvider != "FARGATE_SPOT")] |
         length) == 0)) and
      ($s.deploymentConfiguration.minimumHealthyPercent == 0) and
      ($s.deploymentConfiguration.maximumPercent == 100) and
      ($s.deploymentConfiguration.deploymentCircuitBreaker.enable == true) and
      ($s.deploymentConfiguration.deploymentCircuitBreaker.rollback == true)' sketchcatch-convergence-service.json)
    [ "$HEALTHY" = true ] || unhealthy
    curl --fail --silent --show-error --max-time 10 --max-redirs 0 --proto '=https' \
      "$SKETCHCATCH_HEALTH_URL" >/dev/null || unhealthy
    DESIRED_COUNT=$(jq -r '.services[0].desiredCount' sketchcatch-convergence-service.json)
    echo "SKETCHCATCH_PREVIOUS_TASK_DEFINITION=$TASK_DEFINITION" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_NEW_TASK_DEFINITION=$TASK_DEFINITION" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_DESIRED_COUNT=$DESIRED_COUNT" >> "$GITHUB_ENV"
    ;;
  lambda_alias)
    aws lambda get-alias --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" \
      --name "$SKETCHCATCH_LAMBDA_ALIAS" --output json > sketchcatch-convergence-alias.json 2>/dev/null || { write_env; exit 0; }
    ACTIVE_VERSION=$(jq -r '.FunctionVersion // empty' sketchcatch-convergence-alias.json)
    [[ "$ACTIVE_VERSION" =~ ^[1-9][0-9]*$ ]] || target_mismatch
    [ "$(jq -r '(.RoutingConfig.AdditionalVersionWeights // {}) | length' sketchcatch-convergence-alias.json)" = 0 ] || target_mismatch
    aws lambda get-function --function-name "$SKETCHCATCH_LAMBDA_FUNCTION" --qualifier "$ACTIVE_VERSION" \
      --output json > sketchcatch-convergence-function.json 2>/dev/null || { write_env; exit 0; }
    [ "$(jq -r '(.Configuration.Architectures // []) == ["x86_64"]' sketchcatch-convergence-function.json)" = true ] || target_mismatch
    [ "$(jq -r '(.Configuration.State == "Active") and (.Configuration.LastUpdateStatus == "Successful")' sketchcatch-convergence-function.json)" = true ] || unhealthy
    aws deploy get-deployment-group --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
      --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
      --output json > sketchcatch-convergence-group.json 2>/dev/null || { write_env; exit 0; }
    [ "$(jq -r '.Configuration.Description // empty' sketchcatch-convergence-function.json)" = "$MARKER" ] || artifact_identity_mismatch
    REMOTE_DIGEST=$(jq -r '.Configuration.CodeSha256 // empty' sketchcatch-convergence-function.json | base64 --decode 2>/dev/null | xxd -p -c 256)
    [ "sha256:$REMOTE_DIGEST" = "$SKETCHCATCH_ARTIFACT_DIGEST" ] || artifact_digest_mismatch
    GROUP_VALID=$(jq -r '
      .deploymentGroupInfo as $g |
      ($g.computePlatform == "Lambda") and
      ($g.deploymentConfigName == "CodeDeployDefault.LambdaAllAtOnce") and
      ($g.autoRollbackConfiguration.enabled == true) and
      (($g.autoRollbackConfiguration.events // []) | index("DEPLOYMENT_FAILURE") != null)' sketchcatch-convergence-group.json)
    [ "$GROUP_VALID" = true ] || target_mismatch
    curl --fail --silent --show-error --max-time 10 --max-redirs 0 --proto '=https' \
      "$SKETCHCATCH_HEALTH_URL" >/dev/null || unhealthy
    DEPLOYMENT_ID=$(jq -r '.deploymentGroupInfo.lastSuccessfulDeployment.deploymentId // empty' sketchcatch-convergence-group.json)
    [[ "$DEPLOYMENT_ID" =~ ^d-[A-Za-z0-9]+$ ]] || target_mismatch
    echo "SKETCHCATCH_PREVIOUS_VERSION=$ACTIVE_VERSION" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_PUBLISHED_VERSION=$ACTIVE_VERSION" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID=$DEPLOYMENT_ID" >> "$GITHUB_ENV"
    ;;
  ec2_auto_scaling_group)
    aws deploy get-deployment-group --application-name "$SKETCHCATCH_CODEDEPLOY_APPLICATION" \
      --deployment-group-name "$SKETCHCATCH_CODEDEPLOY_GROUP" \
      --output json > sketchcatch-convergence-group.json 2>/dev/null || { write_env; exit 0; }
    GROUP_VALID=$(jq -r --arg asg "$SKETCHCATCH_ASG_NAME" '
      .deploymentGroupInfo as $g |
      ($g.computePlatform == "Server") and
      ($g.deploymentConfigName == "CodeDeployDefault.AllAtOnce") and
      (([$g.autoScalingGroups[]?.name] | sort) == [$asg]) and
      ($g.autoRollbackConfiguration.enabled == true) and
      (($g.autoRollbackConfiguration.events // []) | index("DEPLOYMENT_FAILURE") != null)' sketchcatch-convergence-group.json)
    [ "$GROUP_VALID" = true ] || target_mismatch
    DEPLOYMENT_ID=$(jq -r '.deploymentGroupInfo.lastSuccessfulDeployment.deploymentId // empty' sketchcatch-convergence-group.json)
    [[ "$DEPLOYMENT_ID" =~ ^d-[A-Za-z0-9]+$ ]] || target_mismatch
    aws deploy get-deployment --deployment-id "$DEPLOYMENT_ID" --output json \
      > sketchcatch-convergence-deployment.json 2>/dev/null || { write_env; exit 0; }
    [ "$(jq -r '.deploymentInfo.status // empty' sketchcatch-convergence-deployment.json)" = Succeeded ] || unhealthy
    [ "$(jq -r '.deploymentInfo.description // empty' sketchcatch-convergence-deployment.json)" = "$MARKER" ] || artifact_identity_mismatch
    jq '.deploymentInfo.revision' sketchcatch-convergence-deployment.json > sketchcatch-current-revision.json
    BUCKET=$(jq -r '.s3Location.bucket // empty' sketchcatch-current-revision.json)
    KEY=$(jq -r '.s3Location.key // empty' sketchcatch-current-revision.json)
    VERSION=$(jq -r '.s3Location.version // empty' sketchcatch-current-revision.json)
    [ -n "$BUCKET" ] && [ -n "$KEY" ] && [ -n "$VERSION" ] || target_mismatch
    aws s3api get-object --bucket "$BUCKET" --key "$KEY" --version-id "$VERSION" \
      "$RUNNER_TEMP/sketchcatch-active-bundle.zip" >/dev/null 2>&1 || { write_env; exit 0; }
    REMOTE_DIGEST=$(sha256sum "$RUNNER_TEMP/sketchcatch-active-bundle.zip" | awk '{print $1}')
    [ "sha256:$REMOTE_DIGEST" = "$SKETCHCATCH_ARTIFACT_DIGEST" ] || artifact_digest_mismatch
    aws deploy list-deployment-instances --deployment-id "$DEPLOYMENT_ID" --output json \
      > sketchcatch-convergence-instances.json 2>/dev/null || { write_env; exit 0; }
    aws deploy list-deployment-instances --deployment-id "$DEPLOYMENT_ID" --include-only-statuses Succeeded --output json \
      > sketchcatch-convergence-succeeded.json 2>/dev/null || { write_env; exit 0; }
    TARGET_COUNT=$(jq '.instancesList | length' sketchcatch-convergence-instances.json)
    SUCCEEDED_COUNT=$(jq '.instancesList | length' sketchcatch-convergence-succeeded.json)
    [ "$TARGET_COUNT" -gt 0 ] && [ "$SUCCEEDED_COUNT" -eq "$TARGET_COUNT" ] || unhealthy
    curl --fail --silent --show-error --max-time 10 --max-redirs 0 --proto '=https' \
      "$SKETCHCATCH_HEALTH_URL" >/dev/null || unhealthy
    echo "SKETCHCATCH_ARTIFACT_URI=s3://$BUCKET/$KEY" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_ARTIFACT_VERSION_ID=$VERSION" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_CODEDEPLOY_DEPLOYMENT_ID=$DEPLOYMENT_ID" >> "$GITHUB_ENV"
    ;;
  static_s3_cloudfront)
    aws cloudfront get-distribution-config --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
      --output json > sketchcatch-convergence-distribution.json 2>/dev/null || { write_env; exit 0; }
    STATUS=$(aws cloudfront get-distribution --id "$SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID" \
      --query 'Distribution.Status' --output text 2>/dev/null) || { write_env; exit 0; }
    [ "$STATUS" = Deployed ] || unhealthy
    ACTIVE_PREFIX=$(jq -r --arg origin "$SKETCHCATCH_CLOUDFRONT_ORIGIN_ID" --arg bucket "$SKETCHCATCH_STATIC_BUCKET" '
      [.DistributionConfig.Origins.Items[]? |
       select(.Id == $origin and (.DomainName | startswith($bucket + ".s3"))) | .OriginPath][0] // empty' \
      sketchcatch-convergence-distribution.json)
    [[ "$ACTIVE_PREFIX" == /releases/* ]] || target_mismatch
    ACTIVE_PREFIX="\${ACTIVE_PREFIX#/}"
    CURRENT_ARTIFACT_FINGERPRINT=$(jq -r --arg origin "$SKETCHCATCH_CLOUDFRONT_ORIGIN_ID" '
      [.DistributionConfig.Origins.Items[]? | select(.Id == $origin) |
       .CustomHeaders.Items[]? | select((.HeaderName | ascii_downcase) == "x-sketchcatch-artifact-fingerprint") |
       .HeaderValue][0] // empty' sketchcatch-convergence-distribution.json)
    CURRENT_TARGET_FINGERPRINT=$(jq -r --arg origin "$SKETCHCATCH_CLOUDFRONT_ORIGIN_ID" '
      [.DistributionConfig.Origins.Items[]? | select(.Id == $origin) |
       .CustomHeaders.Items[]? | select((.HeaderName | ascii_downcase) == "x-sketchcatch-deployment-target-fingerprint") |
       .HeaderValue][0] // empty' sketchcatch-convergence-distribution.json)
    [ "$CURRENT_ARTIFACT_FINGERPRINT" = "$SKETCHCATCH_APPLICATION_ARTIFACT_FINGERPRINT" ] || artifact_identity_mismatch
    [ "$CURRENT_TARGET_FINGERPRINT" = "$SKETCHCATCH_DEPLOYMENT_TARGET_FINGERPRINT" ] || target_mismatch
    MANIFEST_KEY="$ACTIVE_PREFIX/.sketchcatch-release-manifest.json"
    aws s3api get-object --bucket "$SKETCHCATCH_STATIC_BUCKET" --key "$MANIFEST_KEY" \
      "$RUNNER_TEMP/sketchcatch-active-manifest.json" \
      > sketchcatch-convergence-manifest-response.json 2>/dev/null || { write_env; exit 0; }
    REMOTE_DIGEST=$(sha256sum "$RUNNER_TEMP/sketchcatch-active-manifest.json" | awk '{print $1}')
    [ "sha256:$REMOTE_DIGEST" = "$SKETCHCATCH_ARTIFACT_DIGEST" ] || artifact_digest_mismatch
    curl --fail --silent --show-error --max-time 10 --max-redirs 0 --proto '=https' \
      "$SKETCHCATCH_HEALTH_URL" >/dev/null || unhealthy
    VERSION=$(jq -r '.VersionId // empty' sketchcatch-convergence-manifest-response.json)
    [ -n "$VERSION" ] || { write_env; exit 0; }
    echo "SKETCHCATCH_RELEASE_PREFIX=$ACTIVE_PREFIX" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_PREVIOUS_RELEASE_PREFIX=$ACTIVE_PREFIX" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_MANIFEST_URI=s3://$SKETCHCATCH_STATIC_BUCKET/$MANIFEST_KEY" >> "$GITHUB_ENV"
    echo "SKETCHCATCH_MANIFEST_VERSION_ID=$VERSION" >> "$GITHUB_ENV"
    ;;
  *)
    write_env
    exit 0
    ;;
esac

OUTCOME=already_active
FALLBACK_REASON=
write_env
`;
}

function renderEcsFargateBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_IMAGE_DIGEST
    - SKETCHCATCH_ECR_URI

phases:
  pre_build:
    commands:
      - set -euo pipefail
      - test -n "$SKETCHCATCH_COMMIT_SHA"
      - test -f "$SKETCHCATCH_DOCKERFILE_PATH"
      - AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      - SKETCHCATCH_ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$SKETCHCATCH_ECR_REPOSITORY"
      - SKETCHCATCH_CACHE_URI="$SKETCHCATCH_ECR_URI:sketchcatch-buildcache-v1"
      - aws ecr describe-repositories --repository-names "$SKETCHCATCH_ECR_REPOSITORY" >/dev/null
      - aws ecr get-login-password | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
      - docker buildx create --use --name sketchcatch-builder || docker buildx use sketchcatch-builder
      - docker buildx inspect --bootstrap
  build:
    commands:
      - >-
        docker buildx build
        --file "$SKETCHCATCH_DOCKERFILE_PATH"
        --tag "$SKETCHCATCH_ECR_URI:$SKETCHCATCH_COMMIT_SHA"
        --cache-from type=registry,ref="$SKETCHCATCH_CACHE_URI"
        --cache-to type=registry,ref="$SKETCHCATCH_CACHE_URI",mode=max,oci-mediatypes=true,image-manifest=true,ignore-error=true
        --push
        "$SKETCHCATCH_SOURCE_ROOT"
  post_build:
    commands:
      - SKETCHCATCH_IMAGE_DIGEST=$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageTag="$SKETCHCATCH_COMMIT_SHA" --query 'imageDetails[0].imageDigest' --output text)
      - test "$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageDigest="$SKETCHCATCH_IMAGE_DIGEST" --query 'imageDetails[0].imageDigest' --output text)" = "$SKETCHCATCH_IMAGE_DIGEST"
`;
}

export function createAwsRoleDiffPreview(input: GitCicdWorkflowRenderInput): GitCicdAwsRoleDiff {
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const repository = `${input.repositoryOwner}/${input.repositoryName}`;

  return {
    roleArn: input.awsRoleArn ?? null,
    repository,
    targetBranch: input.targetBranch,
    environmentName,
    requiredTrustConditions: {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": `repo:${repository}:environment:${environmentName}`,
      "sketchcatch:target_branch": input.targetBranch
    },
    approved: Boolean(input.approvedByUserId && input.approvedAt),
    approvedByUserId: input.approvedByUserId ?? null,
    approvedAt: input.approvedAt ?? null
  };
}

function renderInfraWorkflow(input: GitCicdWorkflowRenderInput): string {
  const terraformDirectory = `sketchcatch/${input.projectSlug}/terraform`;
  const infraPathGlob = createMonitoredPathGlob(input.infraPath ?? terraformDirectory);
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const ecsFargate = getEcsFargateWorkflowInput(input);
  const lambda = getLambdaWorkflowInput(input);
  const ec2Asg = getEc2AsgWorkflowInput(input);
  const staticSite = getStaticSiteWorkflowInput(input);
  const applicationSourceRoot =
    ecsFargate?.confirmedBuildConfig.sourceRoot ??
    lambda?.confirmedBuildConfig.sourceRoot ??
    ec2Asg?.confirmedBuildConfig.sourceRoot ??
    staticSite?.confirmedBuildConfig.sourceRoot;
  const applicationTriggerPaths = applicationSourceRoot
    ? `\n      - ${JSON.stringify(createMonitoredPathGlob(input.appPath ?? applicationSourceRoot))}${
        ecsFargate ? `\n      - 'sketchcatch/${input.projectSlug}/ci-cd/buildspec-ecs.yml'` : ""
      }`
    : "";

  return `name: SketchCatch Infra

on:
  push:
    branches: [${JSON.stringify(input.targetBranch)}]
    paths:
      - ${JSON.stringify(infraPathGlob)}
${applicationTriggerPaths}
      - '.github/workflows/sketchcatch-infra.yml'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  TF_IN_AUTOMATION: "true"
  SKETCHCATCH_AWS_REGION: \${{ vars.SKETCHCATCH_AWS_REGION }}
  SKETCHCATCH_TF_STATE_BUCKET: \${{ vars.SKETCHCATCH_TF_STATE_BUCKET }}
  SKETCHCATCH_TF_STATE_KEY: \${{ vars.SKETCHCATCH_TF_STATE_KEY }}
  TF_VAR_rds_enabled: \${{ vars.SKETCHCATCH_RDS_ENABLED }}

jobs:
  plan:
    environment: ${environmentName}
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${terraformDirectory}
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Bootstrap Terraform backend
        shell: bash
        run: |
          aws s3api head-bucket --bucket "$SKETCHCATCH_TF_STATE_BUCKET" 2>/dev/null || aws s3api create-bucket --bucket "$SKETCHCATCH_TF_STATE_BUCKET" --region "$SKETCHCATCH_AWS_REGION" --create-bucket-configuration LocationConstraint="$SKETCHCATCH_AWS_REGION"
          cat > backend.auto.tfbackend <<EOF
          bucket = "$SKETCHCATCH_TF_STATE_BUCKET"
          key    = "$SKETCHCATCH_TF_STATE_KEY"
          region = "$SKETCHCATCH_AWS_REGION"
          EOF
          if grep -R --include='*.tf' -Eq 'backend[[:space:]]+"[^"]+"' .; then
            grep -R --include='*.tf' -Eq 'backend[[:space:]]+"s3"' . || {
              echo "::error::Existing Terraform backend must be s3."
              exit 1
            }
          else
            echo 'terraform { backend "s3" {} }' > sketchcatch-backend.tf
          fi
      - run: terraform init -backend-config=backend.auto.tfbackend
      - run: terraform validate
      - run: terraform plan -out=tfplan
      - run: terraform show -json tfplan > tfplan.json
      - uses: actions/upload-artifact@v4
        with:
          name: sketchcatch-tfplan
          path: ${terraformDirectory}/tfplan

  apply:
    runs-on: ubuntu-latest
    needs: plan
    environment: ${environmentName}
    defaults:
      run:
        working-directory: ${terraformDirectory}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: sketchcatch-tfplan
          path: ${terraformDirectory}
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Restore backend
        shell: bash
        run: |
          cat > backend.auto.tfbackend <<EOF
          bucket = "$SKETCHCATCH_TF_STATE_BUCKET"
          key    = "$SKETCHCATCH_TF_STATE_KEY"
          region = "$SKETCHCATCH_AWS_REGION"
          EOF
          if grep -R --include='*.tf' -Eq 'backend[[:space:]]+"[^"]+"' .; then
            grep -R --include='*.tf' -Eq 'backend[[:space:]]+"s3"' . || {
              echo "::error::Existing Terraform backend must be s3."
              exit 1
            }
          else
            echo 'terraform { backend "s3" {} }' > sketchcatch-backend.tf
          fi
      - run: terraform init -backend-config=backend.auto.tfbackend
      - run: terraform apply -auto-approve tfplan
      - run: terraform output -json > sketchcatch-outputs.json
      - uses: actions/upload-artifact@v4
        with:
          name: sketchcatch-terraform-outputs
          path: ${terraformDirectory}/sketchcatch-outputs.json
`;
}

function renderAppWorkflow(input: GitCicdWorkflowRenderInput): string {
  const releaseDirectory = `sketchcatch/${input.projectSlug}/static-site`;
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;
  const appPathGlob = createMonitoredPathGlob(input.appPath ?? releaseDirectory);

  return `name: SketchCatch App

on:
  push:
    branches: [${JSON.stringify(input.targetBranch)}]
    paths:
      - ${JSON.stringify(appPathGlob)}
      - '.github/workflows/sketchcatch-app.yml'
  workflow_run:
    workflows: ["SketchCatch Infra"]
    types: [completed]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  SKETCHCATCH_ASG_NAME: \${{ vars.SKETCHCATCH_ASG_NAME }}

jobs:
  release:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    environment: ${environmentName}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Upload release artifact
        shell: bash
        run: |
          RELEASE_ID="\${GITHUB_SHA}"
          test -d "${releaseDirectory}" || mkdir -p "${releaseDirectory}"
          echo "$RELEASE_ID" > "${releaseDirectory}/release.txt"
          tar -czf sketchcatch-release.tgz -C "${releaseDirectory}" .
          aws s3 cp sketchcatch-release.tgz "s3://\${{ vars.SKETCHCATCH_RELEASE_BUCKET }}/releases/$RELEASE_ID/sketchcatch-release.tgz"
      - name: Refresh Auto Scaling Group
        shell: bash
        run: |
          ASG_NAME="\${SKETCHCATCH_ASG_NAME:-}"
          if [ -z "$ASG_NAME" ]; then
            echo "SKETCHCATCH_ASG_NAME is empty; skipping instance refresh."
            exit 0
          fi
          RELEASE_ID="\${GITHUB_SHA}"
          aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --query 'AutoScalingGroups[0]' --output json > sketchcatch-asg.json
          LT_ID=$(python3 - <<'PY'
          import json
          with open("sketchcatch-asg.json", encoding="utf-8") as handle:
              asg = json.load(handle) or {}
          spec = asg.get("LaunchTemplate") or ((asg.get("MixedInstancesPolicy") or {}).get("LaunchTemplate") or {}).get("LaunchTemplateSpecification") or {}
          print(spec.get("LaunchTemplateId") or "")
          PY
          )
          LT_NAME=$(python3 - <<'PY'
          import json
          with open("sketchcatch-asg.json", encoding="utf-8") as handle:
              asg = json.load(handle) or {}
          spec = asg.get("LaunchTemplate") or ((asg.get("MixedInstancesPolicy") or {}).get("LaunchTemplate") or {}).get("LaunchTemplateSpecification") or {}
          print(spec.get("LaunchTemplateName") or "")
          PY
          )
          LT_VERSION=$(python3 - <<'PY'
          import json
          with open("sketchcatch-asg.json", encoding="utf-8") as handle:
              asg = json.load(handle) or {}
          spec = asg.get("LaunchTemplate") or ((asg.get("MixedInstancesPolicy") or {}).get("LaunchTemplate") or {}).get("LaunchTemplateSpecification") or {}
          print(spec.get("Version") or "$Latest")
          PY
          )
          if [ -n "$LT_ID" ]; then
            LT_LOOKUP_ARGS=(--launch-template-id "$LT_ID")
            LT_UPDATE_SPEC="LaunchTemplateId=$LT_ID"
          elif [ -n "$LT_NAME" ]; then
            LT_LOOKUP_ARGS=(--launch-template-name "$LT_NAME")
            LT_UPDATE_SPEC="LaunchTemplateName=$LT_NAME"
          else
            LT_LOOKUP_ARGS=()
            LT_UPDATE_SPEC=""
          fi
          if [ "\${#LT_LOOKUP_ARGS[@]}" -gt 0 ]; then
            aws ec2 describe-launch-template-versions "\${LT_LOOKUP_ARGS[@]}" --versions "$LT_VERSION" --query 'LaunchTemplateVersions[0].LaunchTemplateData' --output json > sketchcatch-launch-template-data.json
            python3 - "$RELEASE_ID" <<'PY'
          import base64
          import json
          import sys

          release_id = sys.argv[1]
          with open("sketchcatch-launch-template-data.json", encoding="utf-8") as handle:
              data = json.load(handle)

          user_data = data.get("UserData") or ""
          decoded = ""
          if user_data:
              decoded = base64.b64decode(user_data).decode("utf-8")

          marker = f"SKETCHCATCH_RELEASE_ID={release_id}"
          lines = decoded.splitlines()
          replaced = False
          next_lines = []
          for line in lines:
              if line.startswith("SKETCHCATCH_RELEASE_ID=") or line.startswith("export SKETCHCATCH_RELEASE_ID="):
                  next_lines.append(f"export {marker}")
                  replaced = True
              else:
                  next_lines.append(line)
          if not replaced:
              next_lines.append(f"export {marker}")

          next_user_data = "\\n".join(next_lines).strip() + "\\n"
          data["UserData"] = base64.b64encode(next_user_data.encode("utf-8")).decode("ascii")
          with open("sketchcatch-launch-template-data-updated.json", "w", encoding="utf-8") as handle:
              json.dump(data, handle)
          PY
            NEW_LT_VERSION=$(aws ec2 create-launch-template-version "\${LT_LOOKUP_ARGS[@]}" --source-version "$LT_VERSION" --version-description "SketchCatch release $RELEASE_ID" --launch-template-data file://sketchcatch-launch-template-data-updated.json --query 'LaunchTemplateVersion.VersionNumber' --output text)
            aws autoscaling update-auto-scaling-group --auto-scaling-group-name "$ASG_NAME" --launch-template "$LT_UPDATE_SPEC,Version=$NEW_LT_VERSION"
          else
            echo "ASG has no Launch Template; continuing with instance refresh only."
          fi
          REFRESH_ID=$(aws autoscaling start-instance-refresh --auto-scaling-group-name "$ASG_NAME" --preferences MinHealthyPercentage=50 --query 'InstanceRefreshId' --output text)
          for attempt in $(seq 1 40); do
            STATUS=$(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "$ASG_NAME" --instance-refresh-ids "$REFRESH_ID" --query 'InstanceRefreshes[0].Status' --output text)
            echo "Instance refresh $REFRESH_ID status: $STATUS"
            case "$STATUS" in
              Successful)
                exit 0
                ;;
              Failed|Cancelled|RollbackFailed|RollbackSuccessful)
                exit 1
                ;;
            esac
            sleep 30
          done
          echo "Instance refresh did not finish within the smoke window."
          exit 1
      - name: Verify URLs
        shell: bash
        run: |
          for url in "\${{ vars.SKETCHCATCH_STATIC_SITE_URL }}" "\${{ vars.SKETCHCATCH_API_BASE_URL }}"; do
            if [ -n "$url" ]; then
              curl --fail --show-error --location "$url" >/tmp/sketchcatch-url-check
            fi
          done
`;
}

function createMonitoredPathGlob(monitoredPath: string): string {
  return monitoredPath === "." ? "**" : `${monitoredPath}/**`;
}

function renderDestroyWorkflow(input: GitCicdWorkflowRenderInput): string {
  const terraformDirectory = `sketchcatch/${input.projectSlug}/terraform`;
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;

  return `name: SketchCatch Destroy

on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  SKETCHCATCH_AWS_REGION: \${{ vars.SKETCHCATCH_AWS_REGION }}
  SKETCHCATCH_TF_STATE_BUCKET: \${{ vars.SKETCHCATCH_TF_STATE_BUCKET }}
  SKETCHCATCH_TF_STATE_KEY: \${{ vars.SKETCHCATCH_TF_STATE_KEY }}
  TF_VAR_rds_enabled: \${{ vars.SKETCHCATCH_RDS_ENABLED }}

jobs:
  destroy:
    runs-on: ubuntu-latest
    environment: ${environmentName}
    defaults:
      run:
        working-directory: ${terraformDirectory}
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.SKETCHCATCH_AWS_ROLE_ARN }}
          aws-region: \${{ vars.SKETCHCATCH_AWS_REGION }}
      - name: Restore backend
        shell: bash
        run: |
          cat > backend.auto.tfbackend <<EOF
          bucket = "$SKETCHCATCH_TF_STATE_BUCKET"
          key    = "$SKETCHCATCH_TF_STATE_KEY"
          region = "$SKETCHCATCH_AWS_REGION"
          EOF
          if grep -R --include='*.tf' -Eq 'backend[[:space:]]+"[^"]+"' .; then
            grep -R --include='*.tf' -Eq 'backend[[:space:]]+"s3"' . || {
              echo "::error::Existing Terraform backend must be s3."
              exit 1
            }
          else
            echo 'terraform { backend "s3" {} }' > sketchcatch-backend.tf
          fi
      - run: terraform init -backend-config=backend.auto.tfbackend
      - run: terraform destroy -auto-approve
      - name: Best-effort release cleanup
        if: always()
        shell: bash
        run: |
          aws s3 rm "s3://\${{ vars.SKETCHCATCH_RELEASE_BUCKET }}/releases/" --recursive || true
          aws s3 rm "s3://\${{ vars.SKETCHCATCH_RELEASE_BUCKET }}/lambda/" --recursive || true
          aws s3 rm "s3://\${{ vars.SKETCHCATCH_RELEASE_BUCKET }}/${input.projectSlug}/ec2-asg/" --recursive || true
          if [ -n "\${{ vars.SKETCHCATCH_STATIC_BUCKET }}" ]; then
            aws s3 rm "s3://\${{ vars.SKETCHCATCH_STATIC_BUCKET }}/releases/" --recursive || true
          fi
`;
}

function createDefaultStateBucket(input: GitCicdWorkflowRenderInput): string {
  return createDefaultBucketName("sketchcatch-tfstate", input);
}

function createDefaultStateKey(input: GitCicdWorkflowRenderInput): string {
  return `${input.projectSlug}/terraform.tfstate`;
}

function createDefaultReleaseBucket(input: GitCicdWorkflowRenderInput): string {
  return createDefaultBucketName("sketchcatch-release", input);
}

function createDefaultBucketName(prefix: string, input: GitCicdWorkflowRenderInput): string {
  return `${prefix}-${input.repositoryOwner}-${input.repositoryName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 63)
    .replace(/-+$/, "");
}
