import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  terraformPluginCacheWarmupFileName,
  warmTerraformPluginCache
} from "./terraform-plugin-cache-warmup.js";
import type { RunTerraformInitOptions, TerraformRunResult } from "./terraform-runner.js";

test("warmTerraformPluginCache initializes an AWS provider workspace and removes it", async () => {
  let capturedWorkdir: string | undefined;

  const result = await warmTerraformPluginCache({
    env: {
      TF_PLUGIN_CACHE_DIR: "C:\\terraform-plugin-cache"
    },
    timeoutMs: 12_345,
    runTerraformInit: async (
      workdir: string,
      options: RunTerraformInitOptions = {}
    ): Promise<TerraformRunResult> => {
      capturedWorkdir = workdir;

      const warmupFile = await readFile(
        join(workdir, terraformPluginCacheWarmupFileName),
        "utf8"
      );

      assert.match(warmupFile, /required_providers/);
      assert.match(warmupFile, /hashicorp\/aws/);
      assert.equal(options.timeoutMs, 12_345);
      assert.equal(options.env?.TF_PLUGIN_CACHE_DIR, "C:\\terraform-plugin-cache");

      return {
        command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: false
      };
    }
  });

  assert.equal(result.exitCode, 0);
  assert.ok(capturedWorkdir);
  const workdir = capturedWorkdir;
  await assert.rejects(() => stat(workdir), /ENOENT/);
});

test("warmTerraformPluginCache removes the workspace when terraform init fails", async () => {
  let capturedWorkdir: string | undefined;

  const result = await warmTerraformPluginCache({
    runTerraformInit: async (workdir: string): Promise<TerraformRunResult> => {
      capturedWorkdir = workdir;

      return {
        command: ["terraform", "init"],
        exitCode: 1,
        stdout: "",
        stderr: "provider registry unavailable",
        timedOut: false
      };
    }
  });

  assert.equal(result.exitCode, 1);
  assert.ok(capturedWorkdir);
  const workdir = capturedWorkdir;
  await assert.rejects(() => stat(workdir), /ENOENT/);
});

test("warmTerraformPluginCache keeps an explicit warmup root inside that directory", async () => {
  const warmupRoot = await mkdtemp(join(tmpdir(), "sketchcatch-warmup-test-"));
  let capturedWorkdir: string | undefined;

  try {
    await warmTerraformPluginCache({
      warmupRoot,
      runTerraformInit: async (workdir: string): Promise<TerraformRunResult> => {
        capturedWorkdir = workdir;

        return {
          command: ["terraform", "init"],
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        };
      }
    });

    assert.ok(capturedWorkdir?.startsWith(warmupRoot));
  } finally {
    await rm(warmupRoot, { force: true, recursive: true });
  }
});
