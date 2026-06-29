import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const terraformInitArgs = ["init", "-backend=false", "-input=false", "-no-color"] as const;
const terraformValidateArgs = ["validate", "-no-color"] as const;
const defaultTerraformPlanFileName = "tfplan";
const defaultTerraformPluginCacheDir = join(tmpdir(), "sketchcatch-terraform-plugin-cache");
const defaultTerraformOutputMaxBytes = 512 * 1024;
const terraformForceKillGraceMs = 2_000;

export type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  timedOut: boolean;
  cancelled?: boolean;
};

export type RunTerraformInitOptions = {
  terraformBinary?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
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

export async function runTerraformDestroyPlan(
  workdir: string,
  options: RunTerraformCommandOptions & { planFileName?: string } = {}
): Promise<TerraformRunResult> {
  const planFileName = options.planFileName ?? defaultTerraformPlanFileName;

  return runTerraformCommand(
    workdir,
    ["plan", "-destroy", "-input=false", "-no-color", `-out=${planFileName}`],
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
  const maxOutputBytes = options.maxOutputBytes ?? defaultTerraformOutputMaxBytes;
  const env = createTerraformProcessEnv(options.env);
  const startedAt = performance.now();

  await ensureTerraformPluginCacheDir(env.TF_PLUGIN_CACHE_DIR);

  if (options.signal?.aborted) {
    return {
      command: [terraformBinary, ...args],
      exitCode: 130,
      stdout: "",
      stderr: "Terraform command cancelled",
      durationMs: elapsedSince(startedAt),
      timedOut: false,
      cancelled: true
    };
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let cancelled = false;
    let outputLimitExceeded = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(terraformBinary, args, {
      cwd: workdir,
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env
    });

    const timer = setTimeout(() => {
      timedOut = true;
      forceKillTimer = terminateTerraformProcess(child);
    }, timeoutMs);

    const abortHandler = () => {
      cancelled = true;
      forceKillTimer = terminateTerraformProcess(child);
    };

    options.signal?.addEventListener("abort", abortHandler, { once: true });

    function clearProcessListeners(): void {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", abortHandler);
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const result = appendTerraformOutputChunk(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = result.output;
      stdoutBytes = result.bytes;

      if (result.limitExceeded && !outputLimitExceeded) {
        outputLimitExceeded = true;
        stderr = appendOutputLimitMessage(stderr, "stdout", maxOutputBytes);
        forceKillTimer = terminateTerraformProcess(child);
      }
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const result = appendTerraformOutputChunk(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = result.output;
      stderrBytes = result.bytes;

      if (result.limitExceeded && !outputLimitExceeded) {
        outputLimitExceeded = true;
        stderr = appendOutputLimitMessage(stderr, "stderr", maxOutputBytes);
        forceKillTimer = terminateTerraformProcess(child);
      }
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
        durationMs: elapsedSince(startedAt),
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
        exitCode: outputLimitExceeded ? 1 : (code ?? 1),
        stdout,
        stderr,
        durationMs: elapsedSince(startedAt),
        timedOut,
        cancelled
      });
    });
  });
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function appendTerraformOutputChunk(
  output: string,
  currentBytes: number,
  chunk: Buffer | string,
  maxBytes: number
): { output: string; bytes: number; limitExceeded: boolean } {
  if (currentBytes >= maxBytes) {
    return {
      output,
      bytes: currentBytes,
      limitExceeded: true
    };
  }

  const buffer = Buffer.from(chunk);
  const nextBytes = currentBytes + buffer.byteLength;

  if (nextBytes <= maxBytes) {
    return {
      output: output + buffer.toString(),
      bytes: nextBytes,
      limitExceeded: false
    };
  }

  const remainingBytes = Math.max(0, maxBytes - currentBytes);
  const truncatedChunk = buffer.subarray(0, remainingBytes).toString();

  return {
    output: `${output}${truncatedChunk}\n[Terraform output truncated after ${maxBytes} bytes]`,
    bytes: maxBytes,
    limitExceeded: true
  };
}

function appendOutputLimitMessage(stderr: string, streamName: "stdout" | "stderr", maxBytes: number): string {
  const message = `Terraform ${streamName} exceeded the ${maxBytes} byte output limit`;

  return stderr.length > 0 ? `${stderr}\n${message}` : message;
}

function terminateTerraformProcess(child: ChildProcess): NodeJS.Timeout {
  child.kill("SIGTERM");

  return setTimeout(() => {
    forceKillTerraformProcess(child);
  }, terraformForceKillGraceMs);
}

function forceKillTerraformProcess(child: ChildProcess): void {
  if (!child.pid) {
    child.kill("SIGKILL");
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true
    });

    killer.on("error", () => {
      child.kill("SIGKILL");
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
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
