import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoStaticAwsCredentialsForApiServer,
  getDeploymentWorkerMode,
  getRuntimeEnv,
  requireEcsWorkerDispatcherConfig,
  requireGitHubAppConfig,
  requireGitHubAppStateSecret,
  requireSketchCatchAwsCallerPrincipalArn
} from "./env.js";

process.env.NODE_ENV = "test";

test("requireSketchCatchAwsCallerPrincipalArn returns a trimmed IAM Role ARN", () => {
  const originalValue = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN;
  process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN =
    " arn:aws:iam::123456789012:role/SketchCatchRuntimeRole ";

  try {
    assert.equal(
      requireSketchCatchAwsCallerPrincipalArn(),
      "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole"
    );
  } finally {
    restoreEnvValue("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN", originalValue);
  }
});

test("requireSketchCatchAwsCallerPrincipalArn rejects non-IAM role ARNs", () => {
  const originalValue = process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN;
  process.env.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN =
    "arn:aws:sts::123456789012:assumed-role/SketchCatchRuntimeRole/session";

  try {
    assert.throws(
      () => requireSketchCatchAwsCallerPrincipalArn(),
      /SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN must be an IAM Role ARN/
    );
  } finally {
    restoreEnvValue("SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN", originalValue);
  }
});

test("assertNoStaticAwsCredentialsForApiServer allows AWS_PROFILE without static keys", () => {
  assert.doesNotThrow(() =>
    assertNoStaticAwsCredentialsForApiServer({
      AWS_PROFILE: "sketchcatch-dev"
    })
  );
});

test("assertNoStaticAwsCredentialsForApiServer rejects static AWS credential environment variables", () => {
  assert.throws(
    () =>
      assertNoStaticAwsCredentialsForApiServer({
        AWS_ACCESS_KEY_ID: "access-key-id",
        AWS_SECRET_ACCESS_KEY: "secret-access-key",
        AWS_SESSION_TOKEN: "session-token",
        AWS_PROFILE: "sketchcatch-dev"
      }),
    /Remove AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN/
  );
});

test("requireGitHubAppConfig reads GIT_APP configuration", () => {
  const originalValues = saveEnvValues([
    "GIT_APP_ID",
    "GIT_APP_SLUG",
    "GIT_APP_PRIVATE_KEY_BASE64",
    "GIT_APP_CALLBACK_URL"
  ]);
  const privateKeyBase64 = Buffer.from(
    "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
    "utf8"
  ).toString("base64");

  try {
    process.env.GIT_APP_ID = "12345";
    process.env.GIT_APP_SLUG = "sketchcatch-local";
    process.env.GIT_APP_PRIVATE_KEY_BASE64 = privateKeyBase64;
    process.env.GIT_APP_CALLBACK_URL =
      "http://localhost:3000/integrations/github/callback";

    const config = requireGitHubAppConfig();

    assert.equal(config.appId, "12345");
    assert.equal(config.appSlug, "sketchcatch-local");
    assert.match(config.privateKey, /BEGIN PRIVATE KEY/);
    assert.equal(config.callbackUrl, "http://localhost:3000/integrations/github/callback");
    assert.equal(getRuntimeEnv().githubAppId, "12345");
  } finally {
    restoreEnvValues(originalValues);
  }
});

test("requireGitHubAppStateSecret accepts GIT_APP_STATE_SECRET", () => {
  const originalValues = saveEnvValues(["AUTH_TOKEN_SECRET", "GIT_APP_STATE_SECRET"]);

  try {
    process.env.AUTH_TOKEN_SECRET = "auth-token-secret-with-at-least-32-characters";
    process.env.GIT_APP_STATE_SECRET =
      "sketchcatch-app-state-secret-with-at-least-32-characters";

    assert.equal(
      requireGitHubAppStateSecret(),
      "sketchcatch-app-state-secret-with-at-least-32-characters"
    );
  } finally {
    restoreEnvValues(originalValues);
  }
});

test("getDeploymentWorkerMode defaults to in_process and accepts ecs", () => {
  assert.equal(getDeploymentWorkerMode({ ...getRuntimeEnv(), deploymentWorkerMode: undefined }), "in_process");
  assert.equal(getDeploymentWorkerMode({ ...getRuntimeEnv(), deploymentWorkerMode: "ecs" }), "ecs");
});

test("getDeploymentWorkerMode rejects unknown modes", () => {
  assert.throws(
    () => getDeploymentWorkerMode({ ...getRuntimeEnv(), deploymentWorkerMode: "sqs" }),
    /DEPLOYMENT_WORKER_MODE must be one of/
  );
});

test("requireEcsWorkerDispatcherConfig validates ECS worker dispatch settings", () => {
  const config = requireEcsWorkerDispatcherConfig({
    ...getRuntimeEnv(),
    deploymentWorkerMode: "ecs",
    ecsWorkerAssignPublicIp: "DISABLED",
    ecsWorkerCluster: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/sketchcatch",
    ecsWorkerCommand: "[\"node\",\"dist/worker.cjs\"]",
    ecsWorkerContainerName: "worker",
    ecsWorkerEnvironment: "{\"NODE_ENV\":\"production\"}",
    ecsWorkerSecurityGroupIds: "sg-123, sg-456",
    ecsWorkerSubnets: "subnet-123, subnet-456",
    ecsWorkerTaskDefinition:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/sketchcatch-worker:1"
  });

  assert.deepEqual(config.command, ["node", "dist/worker.cjs"]);
  assert.deepEqual(config.environment, { NODE_ENV: "production" });
  assert.deepEqual(config.securityGroupIds, ["sg-123", "sg-456"]);
  assert.deepEqual(config.subnetIds, ["subnet-123", "subnet-456"]);
  assert.equal(config.assignPublicIp, "DISABLED");
});

test("requireEcsWorkerDispatcherConfig rejects malformed worker command JSON", () => {
  assert.throws(
    () =>
      requireEcsWorkerDispatcherConfig({
        ...getRuntimeEnv(),
        deploymentWorkerMode: "ecs",
        ecsWorkerCluster: "cluster",
        ecsWorkerCommand: "node dist/worker.cjs",
        ecsWorkerContainerName: "worker",
        ecsWorkerSecurityGroupIds: "sg-123",
        ecsWorkerSubnets: "subnet-123",
        ecsWorkerTaskDefinition: "task-definition"
      }),
    /ECS_WORKER_COMMAND must be a JSON array of strings/
  );
});

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function saveEnvValues(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvValues(values: Map<string, string | undefined>): void {
  for (const [key, value] of values) {
    restoreEnvValue(key, value);
  }
}
