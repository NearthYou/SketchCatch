import type {
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview
} from "@sketchcatch/types";

export const defaultGitCicdEnvironmentName = "sketchcatch-production";

export type GitCicdWorkflowRenderInput = {
  handoffId?: string | undefined;
  projectSlug: string;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
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

  return [
    {
      path: ".github/workflows/sketchcatch-infra.yml",
      content: renderInfraWorkflow(input),
      contentType: "text/yaml"
    },
    {
      path: ".github/workflows/sketchcatch-app.yml",
      content: renderAppWorkflow(input),
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
    }
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
      SKETCHCATCH_ASG_NAME: ""
    },
    secrets: [],
    workflowFiles: [
      ".github/workflows/sketchcatch-infra.yml",
      ".github/workflows/sketchcatch-app.yml",
      ".github/workflows/sketchcatch-destroy.yml"
    ]
  };
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
  const environmentName = input.environmentName ?? defaultGitCicdEnvironmentName;

  return `name: SketchCatch Infra

on:
  push:
    branches: [${JSON.stringify(input.targetBranch)}]
    paths:
      - '${terraformDirectory}/**'
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

  return `name: SketchCatch App

on:
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
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
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
          LT_ID=$(python - <<'PY'
          import json
          with open("sketchcatch-asg.json", encoding="utf-8") as handle:
              asg = json.load(handle) or {}
          spec = asg.get("LaunchTemplate") or ((asg.get("MixedInstancesPolicy") or {}).get("LaunchTemplate") or {}).get("LaunchTemplateSpecification") or {}
          print(spec.get("LaunchTemplateId") or "")
          PY
          )
          LT_NAME=$(python - <<'PY'
          import json
          with open("sketchcatch-asg.json", encoding="utf-8") as handle:
              asg = json.load(handle) or {}
          spec = asg.get("LaunchTemplate") or ((asg.get("MixedInstancesPolicy") or {}).get("LaunchTemplate") or {}).get("LaunchTemplateSpecification") or {}
          print(spec.get("LaunchTemplateName") or "")
          PY
          )
          LT_VERSION=$(python - <<'PY'
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
            python - "$RELEASE_ID" <<'PY'
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
  return `sketchcatch-tfstate-${input.repositoryOwner}-${input.repositoryName}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 63);
}

function createDefaultStateKey(input: GitCicdWorkflowRenderInput): string {
  return `${input.projectSlug}/terraform.tfstate`;
}

function createDefaultReleaseBucket(input: GitCicdWorkflowRenderInput): string {
  return `sketchcatch-release-${input.repositoryOwner}-${input.repositoryName}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 63);
}
