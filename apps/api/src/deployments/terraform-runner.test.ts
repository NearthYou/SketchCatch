import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerraformProcessEnv } from "./terraform-runner.js";

test("createTerraformProcessEnv passes only required runtime env and explicit Terraform env", () => {
  const env = createTerraformProcessEnv(
    {
      AWS_ACCESS_KEY_ID: "temporary-access-key-id",
      AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
      AWS_SESSION_TOKEN: "temporary-session-token",
      AWS_REGION: "ap-northeast-2"
    },
    {
      Path: "C:\\Windows\\System32",
      DATABASE_URL: "postgresql://sketchcatch:secret@db/sketchcatch",
      AUTH_TOKEN_SECRET: "server-auth-token-secret",
      AWS_PROFILE: "sketchcatch-caller",
      AWS_SHARED_CREDENTIALS_FILE: "C:\\Users\\me\\.aws\\credentials"
    }
  );

  assert.equal(env.Path, "C:\\Windows\\System32");
  assert.equal(env.TF_IN_AUTOMATION, "1");
  assert.equal(env.AWS_ACCESS_KEY_ID, "temporary-access-key-id");
  assert.equal(env.AWS_SECRET_ACCESS_KEY, "temporary-secret-access-key");
  assert.equal(env.AWS_SESSION_TOKEN, "temporary-session-token");
  assert.equal(env.AWS_REGION, "ap-northeast-2");
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.AUTH_TOKEN_SECRET, undefined);
  assert.equal(env.AWS_PROFILE, undefined);
  assert.equal(env.AWS_SHARED_CREDENTIALS_FILE, undefined);
});
