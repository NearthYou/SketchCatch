import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const terraformInitArgs = ["init", "-backend=false", "-input=false", "-no-color"] as const;
const terraformValidateArgs = ["validate", "-no-color"] as const;
const defaultTerraformPlanFileName = "tfplan";
const defaultTerraformPluginCacheDir = join(tmpdir(), "sketchcatch-terraform-plugin-cache");

export type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

export type RunTerraformInitOptions = {
  terraformBinary?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal | undefined;
};

export type RunTerraformCommandOptions = RunTerraformInitOptions;

const inheritedTerraformEnvKeys = [
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "windir",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY"
] as const;

export async function runTerraformInit(
  workdir: string,
  options: RunTerraformInitOptions = {}
): Promise<TerraformRunResult> {
  return runTerraformCommand(workdir, [...terraformInitArgs], options);
}

export async function runTerraformValidate(
  workdir: string,
  options: RunTerraformCommandOptions = {}
): Promise<TerraformRunResult> {
  return runTerraformCommand(workdir, [...terraformValidateArgs], options);
}

export async function runTerraformPlan(
  workdir: string,
  options: RunTerraformCommandOptions & { planFileName?: string } = {}
): Promise<TerraformRunResult> {
  const planFileName = options.planFileName ?? defaultTerraformPlanFileName;

  return runTerraformCommand(
    workdir,
    ["plan", "-input=false", "-no-color", `-out=${planFileName}`],
    options
  );
}

export async function runTerraformShowJson(
  workdir: string,
  options: RunTerraformCommandOptions & { planFileName?: string } = {}
): Promise<TerraformRunResult> {
  const planFileName = options.planFileName ?? defaultTerraformPlanFileName;

  return runTerraformCommand(workdir, ["show", "-json", planFileName], options);
}

export async function runTerraformApply(
  workdir: string,
  options: RunTerraformCommandOptions & { planFileName?: string } = {}
): Promise<TerraformRunResult> {
  const planFileName = options.planFileName ?? defaultTerraformPlanFileName;

  return runTerraformCommand(
    workdir,
    ["apply", "-input=false", "-no-color", planFileName],
    options
  );
}

export async function runTerraformOutputJson(
  workdir: string,
  options: RunTerraformCommandOptions = {}
): Promise<TerraformRunResult> {
  return runTerraformCommand(workdir, ["output", "-json"], options);
}

export async function runTerraformShowStateJson(
  workdir: string,
  options: RunTerraformCommandOptions = {}
): Promise<TerraformRunResult> {
  return runTerraformCommand(workdir, ["show", "-json"], options);
}

async function runTerraformCommand(
  workdir: string,
  args: string[],
  options: RunTerraformInitOptions
): Promise<TerraformRunResult> {
  const terraformBinary = options.terraformBinary ?? "terraform";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const env = createTerraformProcessEnv(options.env);

  await ensureTerraformPluginCacheDir(env.TF_PLUGIN_CACHE_DIR);

  if (options.signal?.aborted) {
    return {
      command: [terraformBinary, ...args],
      exitCode: 130,
      stdout: "",
      stderr: "Terraform command cancelled",
      timedOut: false,
      cancelled: true
    };
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const child = spawn(terraformBinary, args, {
      cwd: workdir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const abortHandler = () => {
      cancelled = true;
      child.kill("SIGTERM");
    };

    options.signal?.addEventListener("abort", abortHandler, { once: true });

    function clearProcessListeners(): void {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortHandler);
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearProcessListeners();

      resolve({
        command: [terraformBinary, ...args],
        exitCode: 127,
        stdout,
        stderr: stderr || error.message,
        timedOut,
        cancelled
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearProcessListeners();

      resolve({
        command: [terraformBinary, ...args],
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut,
        cancelled
      });
    });
  });
}

export function createTerraformProcessEnv(
  terraformEnv: NodeJS.ProcessEnv = {},
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of inheritedTerraformEnvKeys) {
    if (baseEnv[key]) {
      env[key] = baseEnv[key];
    }
  }

  return {
    ...env,
    TF_IN_AUTOMATION: "1",
    TF_PLUGIN_CACHE_DIR: getTerraformPluginCacheDir(terraformEnv, baseEnv),
    ...terraformEnv
  };
}

function getTerraformPluginCacheDir(
  terraformEnv: NodeJS.ProcessEnv,
  baseEnv: NodeJS.ProcessEnv
): string {
  return terraformEnv.TF_PLUGIN_CACHE_DIR ?? baseEnv.TF_PLUGIN_CACHE_DIR ?? defaultTerraformPluginCacheDir;
}

async function ensureTerraformPluginCacheDir(cacheDir: string | undefined): Promise<void> {
  if (!cacheDir) {
    return;
  }

  await mkdir(cacheDir, { recursive: true });
}
