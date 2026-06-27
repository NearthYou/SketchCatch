import { spawn } from "node:child_process";

const terraformInitArgs = ["init", "-backend=false", "-input=false", "-no-color"] as const;
const terraformValidateArgs = ["validate", "-no-color"] as const;
const defaultTerraformPlanFileName = "tfplan";

export type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type RunTerraformInitOptions = {
  terraformBinary?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
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

async function runTerraformCommand(
  workdir: string,
  args: string[],
  options: RunTerraformInitOptions
): Promise<TerraformRunResult> {
  const terraformBinary = options.terraformBinary ?? "terraform";
  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(terraformBinary, args, {
      cwd: workdir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: createTerraformProcessEnv(options.env)
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

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
      clearTimeout(timer);

      resolve({
        command: [terraformBinary, ...args],
        exitCode: 127,
        stdout,
        stderr: stderr || error.message,
        timedOut
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      resolve({
        command: [terraformBinary, ...args],
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut
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
    ...terraformEnv
  };
}
