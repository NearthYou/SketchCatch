import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createTerraformApplyArgs,
  createTerraformDestroyPlanArgs,
  createTerraformPlanArgs,
  createTerraformProcessEnv
} from "./terraform-runner.js";

test("Plan, destroy Plan, and Apply commands never use Terraform -target", () => {
  const commands = [
    createTerraformPlanArgs("tfplan"),
    createTerraformDestroyPlanArgs("tfplan"),
    createTerraformApplyArgs("tfplan")
  ];

  for (const command of commands) {
    assert.equal(
      command.some((argument) => argument === "-target" || argument.startsWith("-target=")),
      false
    );
  }
});

test(
  "Terraform runner replaces a Windows-only plugin cache path on POSIX",
  { skip: process.platform === "win32" },
  () => {
    const env = createTerraformProcessEnv(
      {},
      {
        TF_PLUGIN_CACHE_DIR: "C:\\terraform-plugin-cache"
      }
    );

    assert.equal(env.TF_PLUGIN_CACHE_DIR, join(tmpdir(), "sketchcatch-terraform-plugin-cache"));
  }
);
