import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoStaticAwsCredentialsForApiServer,
  getDeploymentWorkerMode,
  isLiveObservationEnabled,
  getRuntimeEnv,
  requireEcsWorkerDispatcherConfig,
  requireGitHubAppConfig,
  requireGitHubAppStateSecret,
  requireLiveObservationCapabilityKeyring,
  requireSketchCatchAwsCallerPrincipalArn
} from "./env.js";
import type { RuntimeEnv } from "./env.js";

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

test("isLiveObservationEnabled requires the explicit true flag", () => {
  assert.equal(
    isLiveObservationEnabled({ ...getRuntimeEnv(), liveObservationEnabled: "true" }),
    true
  );
  assert.equal(
    isLiveObservationEnabled({ ...getRuntimeEnv(), liveObservationEnabled: "false" }),
    false
  );
  assert.equal(
    isLiveObservationEnabled({ ...getRuntimeEnv(), liveObservationEnabled: undefined }),
    false
  );
});

test("getRuntimeEnv reads Live Observation capability keyring variables without requiring them", () => {
  const keys = [
    "LIVE_OBSERVATION_CAPABILITY_CURRENT_KID",
    "LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET",
    "LIVE_OBSERVATION_CAPABILITY_PREVIOUS_KID",
    "LIVE_OBSERVATION_CAPABILITY_PREVIOUS_SECRET",
    "LIVE_OBSERVATION_CAPABILITY_PREVIOUS_STOPPED_ISSUING_AT"
  ];
  const originalValues = saveEnvValues(keys);

  try {
    process.env.LIVE_OBSERVATION_CAPABILITY_CURRENT_KID = "current-key";
    process.env.LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET = CAPABILITY_CURRENT_SECRET;
    process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_KID = "previous-key";
    process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_SECRET = CAPABILITY_PREVIOUS_SECRET;
    process.env.LIVE_OBSERVATION_CAPABILITY_PREVIOUS_STOPPED_ISSUING_AT =
      "2026-07-10T00:00:00.000Z";

    const env = getRuntimeEnv();

    assert.equal(env.liveObservationCapabilityCurrentKid, "current-key");
    assert.equal(env.liveObservationCapabilityCurrentSecret, CAPABILITY_CURRENT_SECRET);
    assert.equal(env.liveObservationCapabilityPreviousKid, "previous-key");
    assert.equal(env.liveObservationCapabilityPreviousSecret, CAPABILITY_PREVIOUS_SECRET);
    assert.equal(
      env.liveObservationCapabilityPreviousStoppedIssuingAt,
      "2026-07-10T00:00:00.000Z"
    );
  } finally {
    restoreEnvValues(originalValues);
  }
});

test("requireLiveObservationCapabilityKeyring returns a validated current key", () => {
  const keyring = requireLiveObservationCapabilityKeyring(capabilityEnv());

  assert.deepEqual(keyring, {
    current: {
      kid: "current-key",
      secret: CAPABILITY_CURRENT_SECRET
    }
  });
});

test("requireLiveObservationCapabilityKeyring accepts a complete previous-key triple", () => {
  const keyring = requireLiveObservationCapabilityKeyring(
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "previous-key",
      liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET,
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    })
  );

  assert.deepEqual(keyring, {
    current: {
      kid: "current-key",
      secret: CAPABILITY_CURRENT_SECRET
    },
    previous: {
      kid: "previous-key",
      secret: CAPABILITY_PREVIOUS_SECRET,
      stoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    }
  });
});

test("requireLiveObservationCapabilityKeyring requires current kid and secret", () => {
  const invalidEnvironments = [
    capabilityEnv({ liveObservationCapabilityCurrentKid: undefined }),
    capabilityEnv({ liveObservationCapabilityCurrentSecret: undefined }),
    capabilityEnv({ liveObservationCapabilityCurrentKid: "" }),
    capabilityEnv({ liveObservationCapabilityCurrentSecret: "" })
  ];

  for (const env of invalidEnvironments) {
    assert.throws(
      () => requireLiveObservationCapabilityKeyring(env),
      /invalid live observation capability/i
    );
  }
});

test("requireLiveObservationCapabilityKeyring requires the previous values all-or-none", () => {
  const invalidEnvironments = [
    capabilityEnv({ liveObservationCapabilityPreviousKid: "previous-key" }),
    capabilityEnv({ liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET }),
    capabilityEnv({
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    }),
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "previous-key",
      liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET
    }),
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "previous-key",
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    }),
    capabilityEnv({
      liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET,
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    })
  ];

  for (const env of invalidEnvironments) {
    assert.throws(
      () => requireLiveObservationCapabilityKeyring(env),
      /invalid live observation capability/i
    );
  }
});

test("requireLiveObservationCapabilityKeyring reuses strict capability validation", () => {
  const invalidSecret = `${CAPABILITY_CURRENT_SECRET}=`;
  const invalidEnvironments = [
    capabilityEnv({ liveObservationCapabilityCurrentKid: "bad kid" }),
    capabilityEnv({ liveObservationCapabilityCurrentSecret: invalidSecret }),
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "current-key",
      liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET,
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    }),
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "previous-key",
      liveObservationCapabilityPreviousSecret: CAPABILITY_CURRENT_SECRET,
      liveObservationCapabilityPreviousStoppedIssuingAt: "2026-07-10T00:00:00.000Z"
    }),
    capabilityEnv({
      liveObservationCapabilityPreviousKid: "previous-key",
      liveObservationCapabilityPreviousSecret: CAPABILITY_PREVIOUS_SECRET,
      liveObservationCapabilityPreviousStoppedIssuingAt: "2999-01-01T00:00:00.000Z"
    })
  ];

  for (const env of invalidEnvironments) {
    const message = captureErrorMessage(() => requireLiveObservationCapabilityKeyring(env));
    assert.match(message, /invalid live observation capability/i);
    assert.equal(message.includes(invalidSecret), false);
    assert.equal(message.includes(CAPABILITY_CURRENT_SECRET), false);
    assert.equal(message.includes(CAPABILITY_PREVIOUS_SECRET), false);
  }
});

test("requireLiveObservationCapabilityKeyring returns fresh keyring objects", () => {
  const env = capabilityEnv();
  const first = requireLiveObservationCapabilityKeyring(env);

  first.current.kid = "mutated-key";
  first.current.secret = CAPABILITY_PREVIOUS_SECRET;

  assert.deepEqual(requireLiveObservationCapabilityKeyring(env), {
    current: {
      kid: "current-key",
      secret: CAPABILITY_CURRENT_SECRET
    }
  });
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

const CAPABILITY_CURRENT_SECRET = Buffer.alloc(32, 0x51).toString("base64url");
const CAPABILITY_PREVIOUS_SECRET = Buffer.alloc(32, 0x52).toString("base64url");

function capabilityEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return {
    ...getRuntimeEnv(),
    liveObservationCapabilityCurrentKid: "current-key",
    liveObservationCapabilityCurrentSecret: CAPABILITY_CURRENT_SECRET,
    liveObservationCapabilityPreviousKid: undefined,
    liveObservationCapabilityPreviousSecret: undefined,
    liveObservationCapabilityPreviousStoppedIssuingAt: undefined,
    ...overrides
  };
}

function captureErrorMessage(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }

  assert.fail("Expected callback to throw");
}
