import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const manifestPath = path.join(repositoryRoot, "infra/aws/production/import-manifest.json");
const workflowPath = path.join(repositoryRoot, ".github/workflows/production-infra-plan.yml");
const deployWorkflowPath = path.join(repositoryRoot, ".github/workflows/deploy-ecs.yml");
const migrationWorkflowPath = path.join(repositoryRoot, ".github/workflows/migrate.yml");
const deployPolicyPath = path.join(
  repositoryRoot,
  "infra/aws/iam/github-actions-deploy-policy.json"
);
const apiDockerfilePath = path.join(repositoryRoot, "docker/api.Dockerfile");
const webDockerfilePath = path.join(repositoryRoot, "docker/web.Dockerfile");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (relativePath) => {
  try {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    failures.push(`Unable to read ${relativePath}: ${error.message}`);
    return "";
  }
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const deployPolicy = JSON.parse(fs.readFileSync(deployPolicyPath, "utf8"));
const deployPolicyStatements = new Map(
  deployPolicy.Statement.map((statement) => [statement.Sid, statement])
);
const runtimeStateObject =
  "arn:aws:s3:::sketchcatch-terraform-state-555980271919-ap-northeast-2/production/ecs-foundation/terraform.tfstate";
const runtimeStateLockObject = `${runtimeStateObject}.tflock`;
const runtimeCacheSecurityGroup =
  "arn:aws:ec2:ap-northeast-2:555980271919:security-group/sg-09d8b7030cba492b4";
const productionAccount = "555980271919";
const productionRegion = "ap-northeast-2";
const productionPrefix = "sketchcatch-production";
const productionArtifactBucket = "sketchcatch-555980271919-ap-northeast-2-an";

check(
  JSON.stringify(deployPolicyStatements.get("AllowRuntimeTerraformStateObjectAccess")) ===
    JSON.stringify({
      Sid: "AllowRuntimeTerraformStateObjectAccess",
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:PutObject"],
      Resource: runtimeStateObject
    }),
  "deploy role must have exact runtime Terraform state object access"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowRuntimeTerraformStateLockAccess")) ===
    JSON.stringify({
      Sid: "AllowRuntimeTerraformStateLockAccess",
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      Resource: runtimeStateLockObject
    }),
  "deploy role must have exact runtime Terraform lock object access"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowRuntimeCacheIngressCreate")) ===
    JSON.stringify({
      Sid: "AllowRuntimeCacheIngressCreate",
      Effect: "Allow",
      Action: "ec2:AuthorizeSecurityGroupIngress",
      Resource: [
        runtimeCacheSecurityGroup,
        "arn:aws:ec2:ap-northeast-2:555980271919:security-group-rule/*"
      ]
    }),
  "deploy role must only create ingress on the production Runtime Cache security group"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowRuntimeCacheIngressReadback")) ===
    JSON.stringify({
      Sid: "AllowRuntimeCacheIngressReadback",
      Effect: "Allow",
      Action: ["ec2:DescribeSecurityGroupRules", "ec2:DescribeSecurityGroups"],
      Resource: "*"
    }),
  "deploy role must be able to read back the created Runtime Cache ingress rules"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowRuntimeCacheIngressRuleTagsOnCreate")) ===
    JSON.stringify({
      Sid: "AllowRuntimeCacheIngressRuleTagsOnCreate",
      Effect: "Allow",
      Action: "ec2:CreateTags",
      Resource: "arn:aws:ec2:ap-northeast-2:555980271919:security-group-rule/*",
      Condition: {
        StringEquals: {
          "ec2:CreateAction": "AuthorizeSecurityGroupIngress"
        }
      }
    }),
  "deploy role must only tag Runtime Cache ingress rules during authorized creation"
);
check(
  JSON.stringify(
    deployPolicyStatements.get("AllowReviewedRuntimeCompleteTaskDefinitionReplacement")
  ) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteTaskDefinitionReplacement",
      Effect: "Allow",
      Action: ["ecs:DeregisterTaskDefinition", "ecs:RegisterTaskDefinition"],
      Resource: [
        `arn:aws:ecs:${productionRegion}:${productionAccount}:task-definition/${productionPrefix}-api:*`,
        `arn:aws:ecs:${productionRegion}:${productionAccount}:task-definition/${productionPrefix}-worker:*`
      ]
    }),
  "deploy role must only replace the reviewed API and worker task definition families"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowReviewedRuntimeCompleteInlinePolicyUpdate")) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteInlinePolicyUpdate",
      Effect: "Allow",
      Action: ["iam:GetRolePolicy", "iam:PutRolePolicy"],
      Resource: [
        `arn:aws:iam::${productionAccount}:role/${productionPrefix}-ecs-task`,
        `arn:aws:iam::${productionAccount}:role/${productionPrefix}-ecs-worker-execution`
      ]
    }),
  "deploy role must only update the two reviewed runtime inline policies"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowReviewedRuntimeCompleteLoadBalancerUpdate")) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteLoadBalancerUpdate",
      Effect: "Allow",
      Action: [
        "elasticloadbalancing:ModifyLoadBalancerAttributes",
        "elasticloadbalancing:ModifyTargetGroup",
        "elasticloadbalancing:ModifyTargetGroupAttributes"
      ],
      Resource: [
        `arn:aws:elasticloadbalancing:${productionRegion}:${productionAccount}:loadbalancer/app/${productionPrefix}-ecs/*`,
        `arn:aws:elasticloadbalancing:${productionRegion}:${productionAccount}:targetgroup/${productionPrefix}-api/*`,
        `arn:aws:elasticloadbalancing:${productionRegion}:${productionAccount}:targetgroup/${productionPrefix}-web/*`
      ]
    }),
  "deploy role must only update the reviewed production load balancer and target groups"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowReviewedRuntimeCompleteReadback")) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteReadback",
      Effect: "Allow",
      Action: [
        "elasticloadbalancing:DescribeLoadBalancerAttributes",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeTargetGroupAttributes",
        "elasticloadbalancing:DescribeTargetGroups"
      ],
      Resource: "*"
    }),
  "deploy role readback must be limited to the ELBv2 attributes Terraform verifies after the reviewed update"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowReviewedRuntimeCompleteMetricFilterUpdate")) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteMetricFilterUpdate",
      Effect: "Allow",
      Action: ["logs:DescribeMetricFilters", "logs:PutMetricFilter"],
      Resource: `arn:aws:logs:${productionRegion}:${productionAccount}:log-group:/sketchcatch/production/ecs/web:*`
    }),
  "deploy role must only update the reviewed web ECS metric filter"
);
check(
  JSON.stringify(deployPolicyStatements.get("AllowReviewedRuntimeCompleteArtifactCorsUpdate")) ===
    JSON.stringify({
      Sid: "AllowReviewedRuntimeCompleteArtifactCorsUpdate",
      Effect: "Allow",
      Action: ["s3:GetBucketCORS", "s3:PutBucketCORS"],
      Resource: `arn:aws:s3:::${productionArtifactBucket}`
    }),
  "deploy role must only update CORS on the reviewed production artifact bucket"
);
const expectedGroups = new Map([
  ["runtime", { root: "infra/aws/terraform", key: "production/ecs-foundation/terraform.tfstate" }],
  ["edge", { root: "infra/aws/production/edge", key: "production/edge/terraform.tfstate" }],
  ["data", { root: "infra/aws/production/data", key: "production/data/terraform.tfstate" }],
  [
    "legacy-rollback",
    {
      root: "infra/aws/production/legacy-rollback",
      key: "production/legacy-rollback/terraform.tfstate"
    }
  ]
]);

check(manifest.schemaVersion === 1, "import manifest schemaVersion must be 1");
check(manifest.locking?.mode === "s3_lockfile", "S3 lockfile must be the locking strategy");
check(manifest.locking?.useLockfile === true, "useLockfile must stay enabled");
check(
  manifest.locking?.bucketVersioningRequired === true,
  "state bucket Versioning must be required"
);
check(manifest.locking?.stateEncryptionRequired === true, "state encryption must be required");
for (const operation of [
  "liveImportAllowed",
  "liveApplyAllowed",
  "liveDestroyAllowed",
  "cloudFormationDeletionAllowed",
  "duplicateRemoteObjectOwnershipAllowed"
]) {
  check(
    manifest.phase9Policy?.[operation] === false,
    `Phase 9 policy must keep ${operation}=false`
  );
}

const groups = Array.isArray(manifest.groups) ? manifest.groups : [];
check(
  groups.length === expectedGroups.size,
  "manifest must contain exactly four management groups"
);
check(
  new Set(groups.map((group) => group.id)).size === groups.length,
  "management group IDs must be unique"
);
check(
  new Set(groups.map((group) => group.backendKey)).size === groups.length,
  "backend keys must be unique"
);

for (const [id, expected] of expectedGroups) {
  const group = groups.find((candidate) => candidate.id === id);
  check(Boolean(group), `missing management group: ${id}`);
  if (!group) continue;

  check(group.terraformRoot === expected.root, `${id} Terraform root changed unexpectedly`);
  check(group.backendKey === expected.key, `${id} backend key changed unexpectedly`);
  check(
    group.policy && group.resources?.length > 0,
    `${id} must document policy and resource inventory`
  );

  const backendConfig = read(group.backendConfig);
  check(
    backendConfig.includes(`key          = "${expected.key}"`),
    `${id} backend config key does not match manifest`
  );
  check(
    backendConfig.includes(`bucket       = "${manifest.stateBucket}"`),
    `${id} backend bucket does not match manifest`
  );
  check(
    backendConfig.includes(`region       = "${manifest.region}"`),
    `${id} backend region does not match manifest`
  );
  check(
    fs.existsSync(path.join(repositoryRoot, group.terraformRoot, ".terraform.lock.hcl")),
    `${id} provider lockfile is missing`
  );
  check(backendConfig.includes("encrypt      = true"), `${id} backend must enable encryption`);
  check(
    backendConfig.includes("use_lockfile = true"),
    `${id} backend must enable native S3 locking`
  );
}

const categories = new Set(
  groups.flatMap((group) =>
    (Array.isArray(group.resources) ? group.resources : []).map((resource) => resource.category)
  )
);
for (const category of [
  "ECS",
  "ALB",
  "ECR",
  "IAM",
  "CloudWatch",
  "Route53",
  "ACM",
  "S3",
  "RDS",
  "Redis/ElastiCache",
  "EC2/SSM rollback",
  "CloudFormation"
]) {
  check(categories.has(category), `import inventory is missing ${category}`);
}

for (const id of ["edge", "data"]) {
  const root = path.join(repositoryRoot, expectedGroups.get(id).root);
  if (!fs.existsSync(root)) {
    failures.push(`${id} directory does not exist: ${root}`);
    continue;
  }
  const terraformFiles = fs.readdirSync(root).filter((name) => name.endsWith(".tf"));
  check(terraformFiles.length > 0, `${id} must be a valid Terraform root`);
  for (const fileName of terraformFiles) {
    const content = fs.readFileSync(path.join(root, fileName), "utf8");
    check(
      !/^\s*(resource|import)\s+/m.test(content),
      `${id}/${fileName} must remain an empty import gate in Phase 9`
    );
  }
}

const runtimeVersions = read("infra/aws/terraform/versions.tf");
check(
  runtimeVersions.includes('required_version = ">= 1.10.0"'),
  "runtime root must require Terraform 1.10+ for S3 lockfiles"
);

const workflow = fs.readFileSync(workflowPath, "utf8");
for (const [id, expected] of expectedGroups) {
  check(workflow.includes(expected.root), `plan workflow is missing ${id} Terraform root`);
  check(workflow.includes(expected.key), `plan workflow is missing ${id} backend key`);
}
for (const marker of [
  "workflow_dispatch:",
  "environment: production-infra-plan",
  "management_group:",
  "runtime_plan_scope:",
  "operation:",
  "approved_plan_run_id:",
  "expected_head_sha:",
  "confirmation:",
  'expected_confirmation="${MANAGEMENT_GROUP}-review-only"',
  "Review-only Terraform plan",
  "Create reviewed apply plan",
  "Validate reviewed apply plan",
  "apply-reviewed-runtime-complete",
  "runtime-complete-apply-${APPROVED_PLAN_RUN_ID}",
  "Validate reviewed complete runtime plan",
  "aws_ecs_task_definition.api",
  "aws_ecs_task_definition.worker",
  '"address": "aws_ecs_service.api"',
  'aws_cloudwatch_log_metric_filter.ecs_error[\\"web\\"]',
  '"address": "aws_s3_bucket_cors_configuration.artifact"',
  "expected_head_sha must exactly match the dispatched commit",
  ".resource_changes[]",
  '"actions": ["create"]',
  "all($rules[];",
  "environment: production",
  "actions: write",
  "actions/upload-artifact@v4",
  "actions/download-artifact@v4",
  "retention-days: 1",
  'terraform -chdir="${TERRAFORM_ROOT}" apply -input=false -no-color tfplan',
  "Delete reviewed plan artifact",
  "actions/artifacts/${ARTIFACT_ID}",
  "plan_args=(-input=false -no-color -detailed-exitcode -lock-timeout=5m)",
  "terraform_wrapper: false",
  "-target=aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_api[0]",
  "-target=aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_worker[0]",
  "use_lockfile=true",
  "PRODUCTION_INFRA_RUNTIME_TFVARS_JSON",
  "runtime tfvars must be a JSON object",
  "GIT_APP_CLIENT_ID: ${{ vars.GIT_APP_CLIENT_ID }}",
  "GIT_APP_CLIENT_SECRET_ARN: ${{ secrets.GIT_APP_CLIENT_SECRET_ARN }}",
  "LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET_ARN: ${{ secrets.LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET_ARN }}",
  ".git_app_client_id = $client_id",
  '.api_secret_arns["GIT_APP_CLIENT_SECRET"] = $client_secret_arn',
  '.api_secret_arns["LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET"] = $live_observation_capability_current_secret_arn',
  "$after_secrets | contains($before_secrets)",
  "$after_values | contains($before_values)",
  "def state_worker_execution_policy:",
  "get_secret_values(state_worker_execution_policy)",
  "aws cloudformation list-stacks",
  "aws cloudformation describe-stacks",
  '.OutputKey == "RedisUrl"',
  '.OutputKey == "SecurityGroupId"',
  "aws ec2 describe-security-groups",
  ".runtime_cache_security_group_id = $security_group_id"
]) {
  check(workflow.includes(marker), `plan-only workflow is missing ${marker}`);
}
check(
  workflow.includes('terraform -chdir="${TERRAFORM_ROOT}" state pull > "${current_state_json}"'),
  "complete runtime plan validation must compare the planned task definitions with Terraform state"
);
check(
  !workflow.includes('aws_cloudwatch_log_metric_filter.ecs_error[\\\\"web\\\\"]'),
  "complete runtime plan validation must use jq-compatible resource address escaping"
);
const extractTerraformOperations = (workflowText) =>
  workflowText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^run:\s*/i, ""))
    .map((line) =>
      line
        .match(/(?:^|&&|\|\||;|\b(?:if|then|do)\b)\s*terraform(?:\s+-\S+)*\s+([a-z][a-z-]*)/i)?.[1]
        ?.toLowerCase()
    )
    .filter(Boolean);

const parserFixtures = [
  { source: "run: terraform init", expected: ["init"] },
  { source: "build && terraform -chdir=infra plan", expected: ["plan"] },
  { source: "if terraform apply; then exit 1; fi", expected: ["apply"] },
  { source: "# terraform destroy", expected: [] },
  { source: 'echo "Terraform import is forbidden"', expected: [] }
];
for (const fixture of parserFixtures) {
  check(
    JSON.stringify(extractTerraformOperations(fixture.source)) === JSON.stringify(fixture.expected),
    `Terraform operation parser failed for: ${fixture.source}`
  );
}

const terraformOperations = extractTerraformOperations(workflow);
check(terraformOperations.includes("init"), "plan workflow must initialize the selected backend");
check(terraformOperations.includes("plan"), "plan workflow must run Terraform plan");
check(terraformOperations.includes("apply"), "approved workflow must apply the reviewed plan file");
check(
  terraformOperations.every((operation) =>
    ["init", "plan", "show", "state", "apply"].includes(operation)
  ),
  `production infrastructure workflow contains unsupported Terraform operations: ${terraformOperations.join(", ")}`
);
check(
  terraformOperations.filter((operation) => operation === "apply").length === 1,
  "production infrastructure workflow must have exactly one reviewed apply command"
);

for (const forbidden of [
  /\bterraform(?:[ \t]+-[^ \t\r\n\\]+)*[ \t]+(?:destroy|import)\b/i,
  /-auto-approve\b/i,
  /\bpull_request:\s*$/m,
  /\bpush:\s*$/m
]) {
  check(!forbidden.test(workflow), `plan-only workflow contains forbidden marker ${forbidden}`);
}

const coldRollbackVariables = read("infra/aws/production/legacy-rollback/variables.tf");
const coldRollbackMain = read("infra/aws/production/legacy-rollback/main.tf");
check(
  coldRollbackVariables.includes('variable "enable_cold_rollback"') &&
    coldRollbackVariables.includes("default     = false"),
  "cold rollback must stay disabled by default"
);
for (const marker of [
  'resource "aws_instance" "app"',
  'resource "aws_lb" "rollback"',
  'resource "aws_lb_target_group" "rollback"',
  "var.enable_cold_rollback ? 1 : 0"
]) {
  check(coldRollbackMain.includes(marker), `cold rollback root is missing ${marker}`);
}
check(
  !/resource\s+"aws_route53_record"/.test(coldRollbackMain),
  "cold rollback must not change Route53 before direct smoke approval"
);
for (const marker of [
  'resource "aws_vpc_security_group_ingress_rule" "rds_from_instance"',
  'resource "aws_vpc_security_group_ingress_rule" "redis_from_instance"'
]) {
  check(coldRollbackMain.includes(marker), `cold rollback data access is missing ${marker}`);
}

for (const retiredPath of [
  ".github/workflows/deploy.yml",
  ".github/workflows/provision-https.yml",
  "infra/aws/cloudformation/alb-https.yml"
]) {
  check(!fs.existsSync(path.join(repositoryRoot, retiredPath)), `${retiredPath} must stay retired`);
}

const runtimeEcs = read("infra/aws/terraform/ecs.tf");
const runtimeAlb = read("infra/aws/terraform/alb.tf");
const runtimeAutoscaling = read("infra/aws/terraform/autoscaling.tf");
const runtimeNetwork = read("infra/aws/terraform/network.tf");
const runtimeVariables = read("infra/aws/terraform/variables.tf");
const runtimeIam = read("infra/aws/terraform/iam.tf");
const apiEcsService =
  runtimeEcs.match(
    /resource "aws_ecs_service" "api" \{([\s\S]*?)\r?\n\}\r?\n\r?\nresource "aws_ecs_service" "web"/
  )?.[1] ?? "";
check(
  apiEcsService.includes("ignore_changes = [desired_count]"),
  "API ECS service must reconcile the Terraform task definition while preserving autoscaling ownership"
);
check(
  !apiEcsService.includes("ignore_changes = [desired_count, task_definition]"),
  "API ECS service must not ignore task definition changes"
);
check(
  !/resource\s+"aws_ecs_service"\s+"app"/.test(runtimeEcs),
  "legacy ECS service must not exist"
);
check(
  !/resource\s+"aws_lb_target_group"\s+"ecs"/.test(runtimeAlb),
  "legacy target group must not exist"
);
for (const marker of [
  'resource "aws_appautoscaling_target" "ecs_service"',
  "ecs_autoscaling_min_capacity",
  "ecs_autoscaling_max_capacity"
]) {
  check(runtimeAutoscaling.includes(marker), `runtime autoscaling is missing ${marker}`);
}
for (const marker of [
  'variable "runtime_cache_security_group_id"',
  'variable "runtime_cache_port"'
]) {
  check(runtimeVariables.includes(marker), `runtime cache networking is missing ${marker}`);
}
for (const marker of [
  'resource "aws_vpc_security_group_ingress_rule" "runtime_cache_from_ecs_api"',
  'resource "aws_vpc_security_group_ingress_rule" "runtime_cache_from_ecs_worker"',
  "referenced_security_group_id = aws_security_group.ecs_service.id",
  "referenced_security_group_id = aws_security_group.ecs_worker.id"
]) {
  check(runtimeNetwork.includes(marker), `runtime cache networking is missing ${marker}`);
}
check(
  runtimeEcs.includes(
    "runtime_cache_security_group_id is required when Live Observation is enabled"
  ),
  "Live Observation must fail its production plan when Runtime Cache ingress is not configured"
);
check(
  runtimeEcs.includes(
    "runtime_cache_security_group_id is required before ECS worker dispatch can be enabled"
  ),
  "ECS worker dispatch must fail its production plan when Runtime Cache ingress is not configured"
);
for (const sid of [
  "AllowProjectArtifacts",
  "AllowDeploymentArtifacts",
  "AllowAwsConnectionCloudFormationTemplates",
  "AllowSketchCatchAwsConnectionAssumeRole",
  "RunWorkerTask",
  "ManageWorkerTask",
  "TagWorkerTaskOnRun",
  "PassWorkerTaskRoles",
  "AllowConfiguredBedrockModels"
]) {
  check(
    new RegExp(`sid\\s*=\\s*\"${sid}\"`).test(runtimeIam),
    `runtime ecs_task policy must retain ${sid}`
  );
}

const deployWorkflow = fs.readFileSync(deployWorkflowPath, "utf8");
for (const marker of [
  "deploy:",
  "type: boolean",
  "default: true",
  "validate:",
  "build-api:",
  "build-web:",
  "production-preflight:",
  "Verify current ECS services are stable",
  "previous-api-task-definition",
  "previous-web-task-definition",
  "previous-worker-task-definition",
  "register-worker:",
  "docker/setup-buildx-action@v4",
  "docker/build-push-action@v7",
  "cache-from:",
  "cache-to:",
  "buildcache-v1",
  "image: ${{ needs.build-api.outputs.image }}",
  "image: ${{ needs.build-web.outputs.image }}",
  "@${IMAGE_DIGEST}",
  "if: ${{ inputs.deploy }}",
  "API_DEPLOY_SECONDS",
  "WEB_DEPLOY_SECONDS",
  "docker buildx imagetools inspect --raw",
  ".layers[].size",
  "GITHUB_STEP_SUMMARY",
  "ECS_WORKER_TASK_DEFINITION_FAMILY",
  "ECS_WORKER_CONTAINER_NAME",
  "Register worker task definition",
  "task-definition-arn: ${{ steps.register-worker.outputs.task-definition-arn }}",
  "ECS_WORKER_TASK_DEFINITION=${{ needs.register-worker.outputs.task-definition-arn }}",
  "AI_BILLING_MODE: ${{ vars.AI_BILLING_MODE }}",
  "AMAZON_Q_ENABLED: ${{ vars.AMAZON_Q_ENABLED }}",
  "AMAZON_Q_REGION: ${{ vars.AMAZON_Q_REGION }}",
  "AMAZON_Q_CREDIT_CONFIRMED: ${{ vars.AMAZON_Q_CREDIT_CONFIRMED }}",
  "AMAZON_Q_APPLICATION_ID: ${{ vars.AMAZON_Q_APPLICATION_ID }}",
  "AMAZON_Q_RETRIEVAL_APPLICATION_ID: ${{ vars.AMAZON_Q_RETRIEVAL_APPLICATION_ID }}",
  'if [ "${AI_BILLING_MODE}" != "aws_credit_only" ]',
  'if [ "${AMAZON_Q_ENABLED}" != "true" ]',
  'if [ "${AMAZON_Q_CREDIT_CONFIRMED}" != "true" ]',
  "AI_BILLING_MODE=${{ env.AI_BILLING_MODE }}",
  "AMAZON_Q_ENABLED=${{ env.AMAZON_Q_ENABLED }}",
  "AMAZON_Q_REGION=${{ env.AMAZON_Q_REGION }}",
  "AMAZON_Q_CREDIT_CONFIRMED=${{ env.AMAZON_Q_CREDIT_CONFIRMED }}",
  "AMAZON_Q_APPLICATION_ID=${{ env.AMAZON_Q_APPLICATION_ID }}",
  "AMAZON_Q_RETRIEVAL_APPLICATION_ID=${{ env.AMAZON_Q_RETRIEVAL_APPLICATION_ID }}",
  "GIT_OAUTH_CLIENT_ID=${{ env.GIT_OAUTH_CLIENT_ID }}",
  "KAKAO_OAUTH_CLIENT_ID=${{ env.KAKAO_OAUTH_CLIENT_ID }}",
  "NAVER_OAUTH_CLIENT_ID=${{ env.NAVER_OAUTH_CLIENT_ID }}",
  "OAUTH_REDIRECT_BASE_URL=${{ env.OAUTH_REDIRECT_BASE_URL }}",
  "SKETCHCATCH_PUBLIC_BASE_URL=${{ env.SKETCHCATCH_PUBLIC_BASE_URL }}"
]) {
  check(deployWorkflow.includes(marker), `ECS deploy workflow is missing ${marker}`);
}
check(
  !/\bdocker\s+(?:build|push)\b/.test(deployWorkflow),
  "ECS deploy workflow must use Buildx action instead of sequential docker build/push commands"
);

const dockerfiles = [
  {
    path: apiDockerfilePath,
    install: "RUN pnpm install --frozen-lockfile --filter @sketchcatch/api...",
    manifests: [
      "COPY apps/api/package.json ./apps/api/package.json",
      "COPY packages/types/package.json ./packages/types/package.json"
    ],
    sourceCopies: [
      "COPY tsconfig.base.json ./",
      "COPY apps/api/src ./apps/api/src",
      "COPY apps/api/drizzle ./apps/api/drizzle",
      "COPY apps/api/tsconfig.json ./apps/api/tsconfig.json",
      "COPY packages/types/src ./packages/types/src"
    ]
  },
  {
    path: webDockerfilePath,
    install: "RUN pnpm install --frozen-lockfile --filter @sketchcatch/web...",
    manifests: [
      "COPY apps/web/package.json ./apps/web/package.json",
      "COPY packages/types/package.json ./packages/types/package.json",
      "COPY packages/ui/package.json ./packages/ui/package.json"
    ],
    sourceCopies: [
      "COPY tsconfig.base.json ./",
      "COPY apps/web/app ./apps/web/app",
      "COPY apps/web/components ./apps/web/components",
      "COPY apps/web/features ./apps/web/features",
      "COPY apps/web/lib ./apps/web/lib",
      "COPY apps/web/public ./apps/web/public",
      "COPY apps/web/next-env.d.ts apps/web/next.config.mjs apps/web/tsconfig.json ./apps/web/",
      "COPY packages/types/src ./packages/types/src",
      "COPY packages/ui/src ./packages/ui/src"
    ]
  }
];

for (const definition of dockerfiles) {
  const dockerfilePath = definition.path;
  const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
  const installIndex = dockerfile.indexOf(definition.install);
  const sourceCopyIndex = dockerfile.indexOf("COPY tsconfig.base.json ./");
  for (const manifest of ["COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./"]) {
    check(dockerfile.includes(manifest), `${path.basename(dockerfilePath)} is missing ${manifest}`);
  }
  for (const manifest of definition.manifests) {
    check(
      dockerfile.includes(manifest) && dockerfile.indexOf(manifest) < installIndex,
      `${path.basename(dockerfilePath)} must copy ${manifest} before dependency installation`
    );
  }
  for (const sourceCopy of definition.sourceCopies) {
    check(
      dockerfile.includes(sourceCopy),
      `${path.basename(dockerfilePath)} is missing ${sourceCopy}`
    );
  }
  check(
    !dockerfile.includes("COPY . ."),
    `${path.basename(dockerfilePath)} must not invalidate its build with unrelated repository files`
  );
  check(
    installIndex >= 0 && sourceCopyIndex > installIndex,
    `${path.basename(dockerfilePath)} must install dependencies before copying source files`
  );
}

const dockerIgnore = read(".dockerignore");
for (const marker of [
  "**/.terraform",
  "coverage",
  ".local-data",
  "*.tsbuildinfo",
  "**/*.test.ts",
  "**/*.test.tsx"
]) {
  check(dockerIgnore.includes(marker), `.dockerignore is missing ${marker}`);
}

const runtimeLocals = read("infra/aws/terraform/locals.tf");
const runtimeConfig = read("infra/aws/terraform/runtime-config.tf");
const runtimeObservability = read("infra/aws/terraform/observability.tf");
check(
  /worker_secret_names\s*=\s*toset\(\[[^\]]*?"GIT_APP_CLIENT_SECRET"/.test(runtimeLocals),
  "worker secret contracts must retain the GitHub App client secret"
);
check(
  /ecs_api_ssm_secure_string_names\s*=\s*toset\(\[[^\]]*?"LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET"/.test(
    runtimeConfig
  ),
  "production API secret requirements must retain the Live Observation capability secret"
);
check(
  /variable "api_secret_arns" \{[\s\S]*?"LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET"/.test(
    runtimeVariables
  ),
  "api_secret_arns validation must allow the Live Observation capability secret"
);
check(
  runtimeLocals.includes('?ERROR ?Error ?error -\\"Failed to find Server Action\\"'),
  "web error metrics must exclude stale Next.js Server Action requests"
);
const containerErrorAlarm =
  runtimeObservability.match(
    /resource "aws_cloudwatch_metric_alarm" "ecs_container_errors" \{([\s\S]*?)\n\}/
  )?.[1] ?? "";
check(
  !containerErrorAlarm.includes("ok_actions"),
  "container log error alarms must not send repetitive OK notifications"
);
check(
  /evaluation_periods\s*=\s*2/.test(containerErrorAlarm) &&
    /datapoints_to_alarm\s*=\s*2/.test(containerErrorAlarm),
  "container log error alarms must require two consecutive error periods"
);

const migrationWorkflow = fs.readFileSync(migrationWorkflowPath, "utf8");
for (const marker of [
  "Create pre-migration RDS snapshot",
  "Run migration as one-off ECS task",
  "ECS_WORKER_TASK_DEFINITION_FAMILY",
  "pnpm migration:compatibility:check"
]) {
  check(migrationWorkflow.includes(marker), `migration workflow is missing ${marker}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Production infra check failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production infrastructure structure check passed.");
}
