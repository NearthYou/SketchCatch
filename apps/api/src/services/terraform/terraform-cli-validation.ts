import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  TerraformDiagnostic,
  TerraformDiagnosticSeverity,
  TerraformSyncFileInput,
  TerraformValidateRequest,
  TerraformValidateResponse
} from "@sketchcatch/types";
import { createTerraformValidationDiagnostics } from "./terraform-diagnostics.js";

const terraformInitArgs = ["init", "-backend=false", "-input=false", "-no-color"] as const;
const terraformValidateJsonArgs = ["validate", "-json"] as const;
const defaultTerraformOutputMaxBytes = 512 * 1024;
const defaultTerraformTimeoutMs = 60_000;
const terraformForceKillGraceMs = 2_000;

export type TerraformCliValidationCommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

export type RunTerraformCliValidationCommand = (
  workdir: string,
  args: readonly string[]
) => Promise<TerraformCliValidationCommandResult>;

export type ValidateTerraformPreviewCodeWithCliOptions = {
  readonly runCommand?: RunTerraformCliValidationCommand | undefined;
  readonly tempRoot?: string | undefined;
};

type TerraformValidationFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

type TerraformValidateJsonOutput = {
  readonly diagnostics?: readonly TerraformValidateJsonDiagnostic[] | undefined;
};

type TerraformValidateJsonDiagnostic = {
  readonly severity?: string | undefined;
  readonly summary?: string | undefined;
  readonly detail?: string | undefined;
  readonly range?:
    | {
        readonly filename?: string | undefined;
        readonly start?:
          | {
              readonly line?: number | undefined;
            }
          | undefined;
      }
    | undefined;
};

export async function validateTerraformPreviewCodeWithCli(
  input: TerraformValidateRequest,
  options: ValidateTerraformPreviewCodeWithCliOptions = {}
): Promise<TerraformValidateResponse> {
  const files = toValidationFiles(input);
  const nonEmptyFiles = files.filter((file) => file.terraformCode.trim().length > 0);

  if (nonEmptyFiles.length === 0) {
    return {
      diagnostics: createTerraformValidationDiagnostics(input)
    };
  }

  const runCommand = options.runCommand ?? runTerraformCliValidationCommand;
  const workdir = await mkdtemp(join(options.tempRoot ?? tmpdir(), "sketchcatch-terraform-validate-"));

  try {
    try {
      await writeTerraformValidationFiles(workdir, nonEmptyFiles);
    } catch {
      return {
        diagnostics: createTerraformValidationDiagnostics(input)
      };
    }

    const initResult = await runCommand(workdir, [...terraformInitArgs]);

    if (isCommandInfrastructureFailure(initResult)) {
      return createFallbackValidationResponse(input, initResult, "init");
    }

    const validateResult = await runCommand(workdir, [...terraformValidateJsonArgs]);
    const diagnostics = parseTerraformValidateJsonDiagnostics(validateResult.stdout);

    if (diagnostics) {
      return {
        diagnostics
      };
    }

    if (isCommandInfrastructureFailure(validateResult)) {
      return createFallbackValidationResponse(input, validateResult, "validate");
    }

    return createFallbackValidationResponse(input, validateResult, "validate");
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runTerraformCliValidationCommand(
  workdir: string,
  args: readonly string[]
): Promise<TerraformCliValidationCommandResult> {
  return runTerraformCommand(workdir, args);
}

async function writeTerraformValidationFiles(
  workdir: string,
  files: readonly TerraformValidationFile[]
): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const filePath = resolveTerraformFilePath(workdir, file.fileName);

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.terraformCode);
    })
  );
}

function resolveTerraformFilePath(workdir: string, fileName: string): string {
  const normalizedFileName = normalizeTerraformFileName(fileName);

  if (isAbsolute(normalizedFileName)) {
    throw new Error("Terraform validation file names must be relative");
  }

  const filePath = resolve(workdir, normalizedFileName);
  const relativePath = relative(workdir, filePath);

  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Terraform validation file names must stay inside the workspace");
  }

  return filePath;
}

function parseTerraformValidateJsonDiagnostics(stdout: string): TerraformDiagnostic[] | null {
  const trimmedStdout = stdout.trim();

  if (!trimmedStdout) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmedStdout);
  } catch {
    return null;
  }

  if (!isTerraformValidateJsonOutput(parsed)) {
    return null;
  }

  return (parsed.diagnostics ?? []).map(toTerraformDiagnostic);
}

function toTerraformDiagnostic(diagnostic: TerraformValidateJsonDiagnostic): TerraformDiagnostic {
  const summary = normalizeTerraformDiagnosticText(maskTerraformValidationMessage(diagnostic.summary ?? ""));
  const detail = normalizeTerraformDiagnosticText(maskTerraformValidationMessage(diagnostic.detail ?? ""));
  const message =
    summary && detail && detail !== summary
      ? `${summary}: ${detail}`
      : (summary ?? detail ?? "Terraform validation failed.");
  const severity = toTerraformDiagnosticSeverity(diagnostic.severity);

  return {
    severity,
    code: "terraform.cli.validate",
    message,
    ...(diagnostic.range?.filename ? { sourceFileName: diagnostic.range.filename } : {}),
    ...(diagnostic.range?.start?.line ? { line: diagnostic.range.start.line } : {})
  };
}

function createFallbackValidationResponse(
  input: TerraformValidateRequest,
  result: TerraformCliValidationCommandResult,
  stage: "init" | "validate"
): TerraformValidateResponse {
  const staticDiagnostics = createTerraformValidationDiagnostics(input);

  if (staticDiagnostics.length > 0) {
    return {
      diagnostics: staticDiagnostics
    };
  }

  return {
    diagnostics: [
      {
        severity: "error",
        code: `terraform.cli.${stage}_failed`,
        message: summarizeCliValidationFailure(result, stage),
        sourceFileName: getFallbackSourceFileName(input)
      }
    ]
  };
}

function summarizeCliValidationFailure(
  result: TerraformCliValidationCommandResult,
  stage: "init" | "validate"
): string {
  if (result.timedOut) {
    return `Terraform ${stage} timed out.`;
  }

  const output = normalizeTerraformDiagnosticText(result.stderr) ?? normalizeTerraformDiagnosticText(result.stdout);

  return output ? `Terraform ${stage} failed: ${maskTerraformValidationMessage(output)}` : `Terraform ${stage} failed.`;
}

function isCommandInfrastructureFailure(result: TerraformCliValidationCommandResult): boolean {
  return result.timedOut || result.exitCode === 127;
}

function toValidationFiles(input: TerraformValidateRequest): TerraformValidationFile[] {
  if (input.terraformFiles && input.terraformFiles.length > 0) {
    return input.terraformFiles.map(toValidationFile);
  }

  return [
    {
      fileName: "main.tf",
      terraformCode: input.terraformCode
    }
  ];
}

function toValidationFile(file: TerraformSyncFileInput): TerraformValidationFile {
  return {
    fileName: normalizeTerraformFileName(file.fileName),
    terraformCode: file.terraformCode
  };
}

function getFallbackSourceFileName(input: TerraformValidateRequest): string {
  return normalizeTerraformFileName(input.terraformFiles?.[0]?.fileName ?? "main.tf");
}

function normalizeTerraformFileName(fileName: string): string {
  const trimmedFileName = fileName.trim();

  if (!trimmedFileName) {
    return "main.tf";
  }

  if (trimmedFileName.endsWith(".tf") || trimmedFileName.endsWith(".tfvars")) {
    return trimmedFileName;
  }

  return `${trimmedFileName}.tf`;
}

function isTerraformValidateJsonOutput(value: unknown): value is TerraformValidateJsonOutput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as TerraformValidateJsonOutput;

  return candidate.diagnostics === undefined || Array.isArray(candidate.diagnostics);
}

function toTerraformDiagnosticSeverity(value: string | undefined): TerraformDiagnosticSeverity {
  return value === "warning" ? "warning" : value === "info" ? "info" : "error";
}

function normalizeTerraformDiagnosticText(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

function maskTerraformValidationMessage(message: string): string {
  return message
    .replace(/\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*=\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_AWS_ACCESS_KEY_ID]");
}

function runTerraformCommand(
  workdir: string,
  args: readonly string[]
): Promise<TerraformCliValidationCommandResult> {
  const terraformBinary = "terraform";

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(terraformBinary, [...args], {
      cwd: workdir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: createTerraformValidationProcessEnv()
    });

    const timer = setTimeout(() => {
      timedOut = true;
      forceKillTimer = terminateTerraformProcess(child);
    }, defaultTerraformTimeoutMs);

    function clearProcessListeners(): void {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const result = appendTerraformOutputChunk(stdout, stdoutBytes, chunk, defaultTerraformOutputMaxBytes);
      stdout = result.output;
      stdoutBytes = result.bytes;

      if (result.limitExceeded && !outputLimitExceeded) {
        outputLimitExceeded = true;
        forceKillTimer = terminateTerraformProcess(child);
      }
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const result = appendTerraformOutputChunk(stderr, stderrBytes, chunk, defaultTerraformOutputMaxBytes);
      stderr = result.output;
      stderrBytes = result.bytes;

      if (result.limitExceeded && !outputLimitExceeded) {
        outputLimitExceeded = true;
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
      clearProcessListeners();

      resolve({
        exitCode: outputLimitExceeded ? 1 : (code ?? 1),
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

function createTerraformValidationProcessEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    windir: process.env.windir,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TMPDIR: process.env.TMPDIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    TF_IN_AUTOMATION: "1"
  };
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

function terminateTerraformProcess(child: ChildProcess): NodeJS.Timeout {
  child.kill("SIGTERM");

  return setTimeout(() => {
    child.kill("SIGKILL");
  }, terraformForceKillGraceMs);
}
