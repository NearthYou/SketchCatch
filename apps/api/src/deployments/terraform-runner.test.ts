import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTerraformProcessEnv,
  runTerraformDestroyPlan,
  runTerraformProvidersSchemaJson,
  runTerraformValidate
} from "./terraform-runner.js";

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
      AWS_SHARED_CREDENTIALS_FILE: "C:\\Users\\me\\.aws\\credentials",
      TF_PLUGIN_CACHE_DIR: "C:\\terraform-plugin-cache"
    }
  );

  assert.equal(env.Path, "C:\\Windows\\System32");
  assert.equal(env.TF_IN_AUTOMATION, "1");
  assert.equal(env.TF_PLUGIN_CACHE_DIR, "C:\\terraform-plugin-cache");
  assert.equal(env.AWS_ACCESS_KEY_ID, "temporary-access-key-id");
  assert.equal(env.AWS_SECRET_ACCESS_KEY, "temporary-secret-access-key");
  assert.equal(env.AWS_SESSION_TOKEN, "temporary-session-token");
  assert.equal(env.AWS_REGION, "ap-northeast-2");
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.AUTH_TOKEN_SECRET, undefined);
  assert.equal(env.AWS_PROFILE, undefined);
  assert.equal(env.AWS_SHARED_CREDENTIALS_FILE, undefined);
});

test("createTerraformProcessEnv sets a default Terraform plugin cache directory", () => {
  const env = createTerraformProcessEnv({}, {});

  assert.equal(env.TF_IN_AUTOMATION, "1");
  assert.match(String(env.TF_PLUGIN_CACHE_DIR), /sketchcatch-terraform-plugin-cache$/);
});

test("runTerraformValidate stops commands that exceed the output limit", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "sketchcatch-terraform-runner-test-"));

  try {
    await writeFile(
      join(workdir, "validate"),
      "process.stdout.write('x'.repeat(128));\n",
      "utf8"
    );

    const result = await runTerraformValidate(workdir, {
      terraformBinary: process.execPath,
      maxOutputBytes: 32,
      timeoutMs: 5_000
    });

    assert.equal(result.exitCode, 1);
    assert.equal(typeof result.durationMs, "number");
    assert.match(result.stdout, /Terraform output truncated after 32 bytes/);
    assert.match(result.stderr, /Terraform stdout exceeded the 32 byte output limit/);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

test("runTerraformDestroyPlan uses a saved destroy plan file", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "sketchcatch-terraform-runner-test-"));

  try {
    await writeFile(
      join(workdir, "plan"),
      "console.log(JSON.stringify(process.argv.slice(2)));\n",
      "utf8"
    );

    const result = await runTerraformDestroyPlan(workdir, {
      terraformBinary: process.execPath,
      planFileName: "destroy.tfplan",
      timeoutMs: 5_000
    });

    assert.equal(result.exitCode, 0);
    assert.equal(typeof result.durationMs, "number");
    assert.deepEqual(JSON.parse(result.stdout), [
      "-destroy",
      "-input=false",
      "-no-color",
      "-out=destroy.tfplan"
    ]);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

test("runTerraformProvidersSchemaJson requests provider schema as JSON", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "sketchcatch-terraform-runner-test-"));

  try {
    await writeFile(
      join(workdir, "providers"),
      "console.log(JSON.stringify(process.argv.slice(2)));\n",
      "utf8"
    );

    const result = await runTerraformProvidersSchemaJson(workdir, {
      terraformBinary: process.execPath,
      timeoutMs: 5_000
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), ["schema", "-json"]);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});
