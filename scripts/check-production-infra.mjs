import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const manifestPath = path.join(repositoryRoot, "infra/aws/production/import-manifest.json");
const workflowPath = path.join(repositoryRoot, ".github/workflows/production-infra-plan.yml");
const deployWorkflowPath = path.join(repositoryRoot, ".github/workflows/deploy-ecs.yml");
const migrationWorkflowPath = path.join(repositoryRoot, ".github/workflows/migrate.yml");

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
  "confirmation:",
  'expected_confirmation="${MANAGEMENT_GROUP}-review-only"',
  "Review-only Terraform plan",
  "plan_args=(-input=false -no-color -detailed-exitcode -lock-timeout=5m)",
  "use_lockfile=true",
  "PRODUCTION_INFRA_RUNTIME_TFVARS_JSON"
]) {
  check(workflow.includes(marker), `plan-only workflow is missing ${marker}`);
}
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
check(
  terraformOperations.every((operation) => ["init", "plan"].includes(operation)),
  `plan workflow contains non-review Terraform operations: ${terraformOperations.join(", ")}`
);

for (const forbidden of [
  /\bterraform(?:[ \t]+-[^ \t\r\n\\]+)*[ \t]+(?:apply|destroy|import)\b/i,
  /-auto-approve\b/i,
  /upload-artifact/i,
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

const deployWorkflow = fs.readFileSync(deployWorkflowPath, "utf8");
for (const marker of [
  "register-worker:",
  "ECS_WORKER_TASK_DEFINITION_FAMILY",
  "ECS_WORKER_CONTAINER_NAME",
  "Register worker task definition",
  "task-definition-arn: ${{ steps.register-worker.outputs.task-definition-arn }}",
  "ECS_WORKER_TASK_DEFINITION=${{ needs.register-worker.outputs.task-definition-arn }}"
]) {
  check(deployWorkflow.includes(marker), `ECS deploy workflow is missing ${marker}`);
}

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
