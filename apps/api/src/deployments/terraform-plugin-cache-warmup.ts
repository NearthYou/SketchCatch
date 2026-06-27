import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTerraformInit,
  type RunTerraformInitOptions,
  type TerraformRunResult
} from "./terraform-runner.js";

export const terraformPluginCacheWarmupFileName = "provider-warmup.tf";

const terraformPluginCacheWarmupFileContent = `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
`;

export type WarmTerraformPluginCacheOptions = RunTerraformInitOptions & {
  warmupRoot?: string;
  runTerraformInit?: (
    workdir: string,
    options?: RunTerraformInitOptions
  ) => Promise<TerraformRunResult>;
};

export async function warmTerraformPluginCache(
  options: WarmTerraformPluginCacheOptions = {}
): Promise<TerraformRunResult> {
  const warmupRoot = options.warmupRoot ?? tmpdir();
  const runInit = options.runTerraformInit ?? runTerraformInit;

  await mkdir(warmupRoot, { recursive: true });

  const workdir = await mkdtemp(join(warmupRoot, "sketchcatch-terraform-warmup-"));

  try {
    await writeFile(
      join(workdir, terraformPluginCacheWarmupFileName),
      terraformPluginCacheWarmupFileContent,
      "utf8"
    );

    const initOptions: RunTerraformInitOptions = {};

    if (options.env !== undefined) {
      initOptions.env = options.env;
    }

    if (options.terraformBinary !== undefined) {
      initOptions.terraformBinary = options.terraformBinary;
    }

    if (options.timeoutMs !== undefined) {
      initOptions.timeoutMs = options.timeoutMs;
    }

    return await runInit(workdir, initOptions);
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
}
