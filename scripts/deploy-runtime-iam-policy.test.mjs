import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const deployWorkflowPath = ".github/workflows/deploy.yml";
const deployScriptPath = "deploy/ec2/deploy-docker-release.sh";
const deployPolicyPath = "infra/aws/iam/github-actions-deploy-policy.json";
const runtimePolicyPath = "infra/aws/iam/ec2-runtime-policy.json";
const apiDockerfilePath = "docker/api.Dockerfile";

function asSortedArray(value) {
  return (Array.isArray(value) ? value : [value]).toSorted();
}

test("production deploy applies the EC2 runtime IAM policy used by AWS connection verification", async () => {
  const deployWorkflow = await readFile(deployWorkflowPath, "utf8");

  assert.match(deployWorkflow, /aws\s+iam\s+put-role-policy/);
  assert.match(deployWorkflow, /--role-name\s+"\$\{SKETCHCATCH_RUNTIME_ROLE_NAME\}"/);
  assert.match(deployWorkflow, /--policy-name\s+"\$\{SKETCHCATCH_RUNTIME_POLICY_NAME\}"/);
  assert.match(
    deployWorkflow,
    /--policy-document\s+file:\/\/infra\/aws\/iam\/ec2-runtime-policy\.json/
  );
});

test("GitHub deployment role can update only the SketchCatch EC2 runtime policy", async () => {
  const deployPolicy = JSON.parse(await readFile(deployPolicyPath, "utf8"));
  const statements = deployPolicy.Statement ?? [];
  const runtimePolicyStatement = statements.find(
    (statement) => statement.Sid === "AllowSketchCatchRuntimePolicyUpdate"
  );

  assert.ok(runtimePolicyStatement);
  assert.deepEqual(asSortedArray(runtimePolicyStatement.Action), [
    "iam:GetRole",
    "iam:GetRolePolicy",
    "iam:PutRolePolicy"
  ].toSorted());
  assert.deepEqual(asSortedArray(runtimePolicyStatement.Resource), [
    "arn:aws:iam::555980271919:role/SketchCatch-EC2-Role"
  ]);
});

test("EC2 runtime policy allows legacy and connection-scoped AWS execution roles", async () => {
  const runtimePolicy = JSON.parse(await readFile(runtimePolicyPath, "utf8"));
  const statements = runtimePolicy.Statement ?? [];
  const assumeRoleStatement = statements.find(
    (statement) => statement.Sid === "AllowSketchCatchAwsConnectionAssumeRole"
  );

  assert.ok(assumeRoleStatement);
  assert.deepEqual(asSortedArray(assumeRoleStatement.Resource), [
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*"
  ].toSorted());
});

test("production deploy injects AI provider runtime configuration into the API container", async () => {
  const deployWorkflow = await readFile(deployWorkflowPath, "utf8");

  for (const envKey of [
    "AI_BILLING_MODE",
    "BEDROCK_CREDIT_CONFIRMED",
    "BEDROCK_MODEL_ID",
    "AMAZON_Q_ENABLED",
    "AMAZON_Q_REGION",
    "AMAZON_Q_CREDIT_CONFIRMED",
    "AMAZON_Q_APPLICATION_ID",
    "AMAZON_Q_USER_ID"
  ]) {
    assert.match(deployWorkflow, new RegExp(`${envKey}=\\$\\{${envKey}`));
    assert.match(deployWorkflow, new RegExp(`${envKey}: \\$\\{\\{ vars\\.${envKey}`));
  }
});

test("EC2 runtime policy allows Bedrock and Amazon Q Business provider calls", async () => {
  const runtimePolicy = JSON.parse(await readFile(runtimePolicyPath, "utf8"));
  const statements = runtimePolicy.Statement ?? [];
  const aiProviderStatement = statements.find(
    (statement) => statement.Sid === "AllowSketchCatchAiProviderCalls"
  );

  assert.ok(aiProviderStatement);
  assert.deepEqual(asSortedArray(aiProviderStatement.Action), [
    "bedrock:InvokeModel",
    "qbusiness:ChatSync"
  ].toSorted());
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

test("production deploy waits for container readiness and prints diagnostics on failure", async () => {
  const deployScript = await readFile(deployScriptPath, "utf8");

  assert.match(deployScript, /HEALTHCHECK_TIMEOUT_SECONDS:-60/);
  assert.match(deployScript, /wait_for_http\(\)/);
  assert.match(deployScript, /curl\s+--fail\s+--silent\s+--show-error\s+"\$\{url\}"/);
  assert.match(deployScript, /print_container_diagnostics\(\)/);
  assert.match(deployScript, /docker\s+ps\s+-a\s+--filter\s+"name=sketchcatch-"/);
  assert.match(deployScript, /docker\s+logs\s+--tail\s+200\s+"\$\{container_name\}"/);
  assert.doesNotMatch(deployScript, /\nsleep\s+3\n/);
});
