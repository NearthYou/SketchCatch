import type {
  ConfirmedBuildConfig,
  ProjectDeploymentRuntimeConfig,
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview,
  RuntimeTargetKind
} from "@sketchcatch/types";

export const defaultGitCicdEnvironmentName = "sketchcatch-production";

export type GitCicdWorkflowRenderInput = {
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

  return [
    {
      path: ".github/workflows/sketchcatch-infra.yml",
      content: renderInfraWorkflow(input),
      contentType: "text/yaml"
    },
    {
      path: ".github/workflows/sketchcatch-app.yml",
      content: ecsFargate ? renderEcsFargateAppWorkflow(input, ecsFargate) : renderAppWorkflow(input),
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
      SKETCHCATCH_ASG_NAME: "",
      SKETCHCATCH_CODEBUILD_PROJECT:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.codeBuildProjectName
          : "",
      SKETCHCATCH_ECR_REPOSITORY:
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.ecrRepositoryName
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
        input.runtimeConfig?.runtimeTargetKind === "ecs_fargate"
          ? input.runtimeConfig.outputUrl
          : ""
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
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }>;
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
  return {
    confirmedBuildConfig: {
      ...build,
      buildPreset: "docker_build",
      dockerfilePath: build.dockerfilePath
    },
    runtimeConfig: runtime
  };
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

jobs:
  release:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == ${JSON.stringify(input.targetBranch)})
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
      - name: Deploy ECS Fargate revision
        shell: bash
        run: |
          set -euo pipefail
          aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > sketchcatch-service-before.json
          PREVIOUS_TASK_DEFINITION=$(jq -r '.services[0].taskDefinition' sketchcatch-service-before.json)
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
          NEW_TASK_DEFINITION=$(aws ecs register-task-definition --cli-input-json file://sketchcatch-task-definition-next.json --query 'taskDefinition.taskDefinitionArn' --output text)
          echo "SKETCHCATCH_PREVIOUS_TASK_DEFINITION=$PREVIOUS_TASK_DEFINITION" >> "$GITHUB_ENV"
          echo "SKETCHCATCH_NEW_TASK_DEFINITION=$NEW_TASK_DEFINITION" >> "$GITHUB_ENV"
          aws ecs update-service \\
            --cluster "$SKETCHCATCH_ECS_CLUSTER" \\
            --service "$SKETCHCATCH_ECS_SERVICE" \\
            --task-definition "$NEW_TASK_DEFINITION" \\
            --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' \\
            --force-new-deployment >/dev/null
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
      - name: Verify ECS release
        shell: bash
        run: |
          set -euo pipefail
          aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > sketchcatch-service-after.json
          aws ecs describe-task-definition --task-definition "$SKETCHCATCH_NEW_TASK_DEFINITION" --query 'taskDefinition' --output json > sketchcatch-task-definition-after.json
          python3 - "$SKETCHCATCH_NEW_TASK_DEFINITION" "$SKETCHCATCH_ECS_CONTAINER" "$SKETCHCATCH_IMAGE_URI" <<'PY'
          import json
          import sys

          expected_task, container_name, image_uri = sys.argv[1:]
          with open("sketchcatch-service-after.json", encoding="utf-8") as handle:
              service = json.load(handle)["services"][0]
          with open("sketchcatch-task-definition-after.json", encoding="utf-8") as handle:
              task = json.load(handle)
          config = service.get("deploymentConfiguration") or {}
          breaker = config.get("deploymentCircuitBreaker") or {}
          desired_count = service.get("desiredCount")
          running_count = service.get("runningCount")
          images = [item.get("image") for item in task.get("containerDefinitions", []) if item.get("name") == container_name]
          valid = (
              service.get("taskDefinition") == expected_task
              and isinstance(desired_count, int)
              and isinstance(running_count, int)
              and desired_count >= 0
              and running_count >= 0
              and desired_count == running_count
              and config.get("minimumHealthyPercent") == 0
              and config.get("maximumPercent") == 100
              and breaker.get("enable") is True
              and breaker.get("rollback") is True
              and images == [image_uri]
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

          evidence = {
              "schemaVersion": 1,
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
              "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
          }
          encoded = base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode()
          print(f"SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64={encoded}")
          PY
      - name: Capture ECS rollback evidence
        if: failure() && env.SKETCHCATCH_NEW_TASK_DEFINITION != ''
        shell: bash
        run: |
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" || true
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

function renderEcsFargateBuildspec(): string {
  return `version: 0.2

env:
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
      - aws ecr describe-repositories --repository-names "$SKETCHCATCH_ECR_REPOSITORY" >/dev/null
      - aws ecr get-login-password | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
  build:
    commands:
      - docker build --file "$SKETCHCATCH_DOCKERFILE_PATH" --tag "$SKETCHCATCH_ECR_URI:$SKETCHCATCH_COMMIT_SHA" "$SKETCHCATCH_SOURCE_ROOT"
  post_build:
    commands:
      - docker push "$SKETCHCATCH_ECR_URI:$SKETCHCATCH_COMMIT_SHA"
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
  const ecsTriggerPaths = ecsFargate
    ? `\n      - ${JSON.stringify(createMonitoredPathGlob(input.appPath ?? ecsFargate.confirmedBuildConfig.sourceRoot))}\n      - 'sketchcatch/${input.projectSlug}/ci-cd/buildspec-ecs.yml'`
    : "";

  return `name: SketchCatch Infra

on:
  push:
    branches: [${JSON.stringify(input.targetBranch)}]
    paths:
      - ${JSON.stringify(infraPathGlob)}
${ecsTriggerPaths}
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
      - run: terraform init -backend-config=backend.auto.tfbackend
      - run: terraform destroy -auto-approve
      - name: Best-effort release cleanup
        if: always()
        shell: bash
        run: |
          aws s3 rm "s3://\${{ vars.SKETCHCATCH_RELEASE_BUCKET }}/releases/" --recursive || true
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
