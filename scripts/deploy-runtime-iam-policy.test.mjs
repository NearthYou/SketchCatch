import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const deployScriptPath = "deploy/ec2/deploy-docker-release.sh";
const deployPolicyPath = "infra/aws/iam/github-actions-deploy-policy.json";
const runtimePolicyPath = "infra/aws/iam/ec2-runtime-policy.json";
const apiDockerfilePath = "docker/api.Dockerfile";

function asSortedArray(value) {
  return (Array.isArray(value) ? value : [value]).toSorted();
}

test("GitHub deployment role excludes retired EC2 and infrastructure provisioning permissions", async () => {
  const deployPolicy = JSON.parse(await readFile(deployPolicyPath, "utf8"));
  const statements = deployPolicy.Statement ?? [];
  const actions = statements.flatMap((statement) => asSortedArray(statement.Action));

  assert.ok(!actions.some((action) => action.startsWith("ssm:")));
  assert.ok(!actions.some((action) => action.startsWith("cloudformation:")));
  assert.ok(!actions.some((action) => action.startsWith("route53:")));
  assert.ok(!actions.some((action) => action.startsWith("ec2:")));
});

test("GitHub deployment role can register and run the isolated worker", async () => {
  const deployPolicy = JSON.parse(await readFile(deployPolicyPath, "utf8"));
  const statements = deployPolicy.Statement ?? [];
  const runTask = statements.find((statement) => statement.Sid === "AllowRunMigrationWorker");
  const passRole = statements.find(
    (statement) => statement.Sid === "AllowPassSketchCatchEcsTaskRoles"
  );

  assert.equal(runTask?.Action, "ecs:RunTask");
  assert.match(runTask?.Resource ?? "", /sketchcatch-production-worker:\*$/);
  assert.ok(
    asSortedArray(passRole?.Resource).includes(
      "arn:aws:iam::555980271919:role/sketchcatch-production-ecs-worker-task"
    )
  );
  assert.equal(
    passRole?.Condition?.StringEquals?.["iam:PassedToService"],
    "ecs-tasks.amazonaws.com"
  );
});

test("GitHub deployment role limits migration snapshot deletion to its prefix", async () => {
  const deployPolicy = JSON.parse(await readFile(deployPolicyPath, "utf8"));
  const statements = deployPolicy.Statement ?? [];
  const snapshotManagement = statements.find(
    (statement) => statement.Sid === "AllowManagePreMigrationSnapshots"
  );

  assert.deepEqual(asSortedArray(snapshotManagement?.Action), [
    "rds:AddTagsToResource",
    "rds:DeleteDBSnapshot"
  ]);
  assert.equal(
    snapshotManagement?.Resource,
    "arn:aws:rds:ap-northeast-2:555980271919:snapshot:sketchcatch-production-pre-migration-*"
  );
});

test("EC2 runtime policy allows legacy and connection-scoped AWS execution roles", async () => {
  const runtimePolicy = JSON.parse(await readFile(runtimePolicyPath, "utf8"));
  const statements = runtimePolicy.Statement ?? [];
  const assumeRoleStatement = statements.find(
    (statement) => statement.Sid === "AllowSketchCatchAwsConnectionAssumeRole"
  );

  assert.ok(assumeRoleStatement);
  assert.deepEqual(
    asSortedArray(assumeRoleStatement.Resource),
    [
      "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
      "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*"
    ].toSorted()
  );
});

test("EC2 runtime policy allows Bedrock and Amazon Q Business provider calls", async () => {
  const runtimePolicy = JSON.parse(await readFile(runtimePolicyPath, "utf8"));
  const statements = runtimePolicy.Statement ?? [];
  const aiProviderStatement = statements.find(
    (statement) => statement.Sid === "AllowSketchCatchAiProviderCalls"
  );

  assert.ok(aiProviderStatement);
  assert.deepEqual(
    asSortedArray(aiProviderStatement.Action),
    ["bedrock:InvokeModel", "qbusiness:ChatSync"].toSorted()
  );
});

test("API Docker image includes Terraform CLI for Direct Deployment execution", async () => {
  const apiDockerfile = await readFile(apiDockerfilePath, "utf8");

  assert.match(apiDockerfile, /FROM\s+alpine:[\d.]+\s+AS\s+terraform/);
  assert.match(apiDockerfile, /ARG\s+TERRAFORM_VERSION=/);
  assert.match(apiDockerfile, /releases\.hashicorp\.com\/terraform/);
  assert.match(
    apiDockerfile,
    /COPY\s+--from=terraform\s+\/usr\/local\/bin\/terraform\s+\/usr\/local\/bin\/terraform/
  );
  assert.match(apiDockerfile, /RUN\s+terraform\s+-version/);
});

test("cold rollback script waits for container readiness and prints diagnostics on failure", async () => {
  const deployScript = await readFile(deployScriptPath, "utf8");

  assert.match(deployScript, /HEALTHCHECK_TIMEOUT_SECONDS:-60/);
  assert.match(deployScript, /wait_for_http\(\)/);
  assert.match(deployScript, /curl\s+--fail\s+--silent\s+--show-error\s+"\$\{url\}"/);
  assert.match(deployScript, /print_container_diagnostics\(\)/);
  assert.match(deployScript, /docker\s+ps\s+-a\s+--filter\s+"name=sketchcatch-"/);
  assert.match(deployScript, /docker\s+logs\s+--tail\s+200\s+"\$\{container_name\}"/);
  assert.doesNotMatch(deployScript, /\nsleep\s+3\n/);
});
