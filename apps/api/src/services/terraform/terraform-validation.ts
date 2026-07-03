import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  CloudProvider,
  TerraformDiagnostic,
  TerraformValidateRequest,
  TerraformValidateResponse,
  TerraformValidationPrepareRequest,
  TerraformValidationPrepareResponse
} from "@sketchcatch/types";
import { maskDeploymentMessage } from "../../deployments/log-masking.js";
import {
  runTerraformInit,
  runTerraformValidateJson,
  type RunTerraformCommandOptions,
  type RunTerraformInitOptions,
  type TerraformRunResult
} from "../../deployments/terraform-runner.js";
import { createTerraformDiagnostics } from "./terraform-diagnostics.js";
import { warmTerraformPluginCache } from "../../deployments/terraform-plugin-cache-warmup.js";

const terraformValidationTempPrefix = "sketchcatch-terraform-validation-";
const terraformProviderSupportFileName = "sketchcatch_provider.tf";
const terraformValidationDefaultRegion = "ap-northeast-2";
const terraformValidationTimeoutMs = 45_000;
const terraformPrepareTimeoutMs = 60_000;
const terraformValidationMaxBytes = 1024 * 1024;
const terraformValidationMaxFileCount = 64;
const terraformValidationMaxFileNameLength = 120;
const unsupportedEditorCliBlockPattern =
  /^\s*(?:terraform\s*\{|module\s+"[^"]+"\s*\{|provider\s+"[^"]+"\s*\{)/;

const terraformAwsProviderSupport = `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
`;

export type ValidateTerraformPreviewCodeDependencies = {
  readonly rootDir?: string;
  readonly runTerraformInit?: (
    workdir: string,
    options?: RunTerraformInitOptions
  ) => Promise<TerraformRunResult>;
  readonly runTerraformValidateJson?: (
    workdir: string,
    options?: RunTerraformCommandOptions
  ) => Promise<TerraformRunResult>;
  readonly timeoutMs?: number;
};

export type PrepareTerraformValidationWorkspaceDependencies = {
  readonly warmTerraformPluginCache?: (
    options?: RunTerraformInitOptions
  ) => Promise<TerraformRunResult>;
  readonly timeoutMs?: number;
};

type TerraformValidationFile = {
  readonly fileName: string;
  readonly terraformCode: string;
};

type TerraformCliJsonDiagnostic = {
  readonly severity?: unknown;
  readonly summary?: unknown;
  readonly detail?: unknown;
  readonly range?: {
    readonly filename?: unknown;
    readonly start?: {
      readonly line?: unknown;
    };
  } | null;
};

const terraformValidationPreparePromises = new Map<
  CloudProvider,
  Promise<TerraformValidationPrepareResponse>
>();

export async function validateTerraformPreviewCode(
  input: TerraformValidateRequest,
  dependencies: ValidateTerraformPreviewCodeDependencies = {}
): Promise<TerraformValidateResponse> {
  const mode = input.mode ?? "static";
  const staticDiagnostics = createStaticValidationDiagnostics(input, {
    includeCliSafetyChecks: mode === "full"
  });

  if (mode === "static") {
    return {
      diagnostics: staticDiagnostics,
      mode,
      stage: "static",
      status: hasErrorDiagnostic(staticDiagnostics) ? "failed" : "passed"
    };
  }

  const staticErrors = staticDiagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const firstStaticError = getFirstDiagnosticByValidationOrder(
    staticErrors,
    toValidationFiles(input)
  );

  if (firstStaticError) {
    return {
      diagnostics: [firstStaticError],
      mode,
      stage: "static",
      status: "failed"
    };
  }

  const staticWarnings = staticDiagnostics.filter((diagnostic) => diagnostic.severity !== "error");

  return validateWithTerraformCli(input, dependencies, staticWarnings);
}

export async function prepareTerraformValidationWorkspace(
  input: TerraformValidationPrepareRequest = {},
  dependencies: PrepareTerraformValidationWorkspaceDependencies = {}
): Promise<TerraformValidationPrepareResponse> {
  if (dependencies.warmTerraformPluginCache === undefined) {
    const provider = input.provider ?? "aws";
    const existingPromise = terraformValidationPreparePromises.get(provider);

    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = prepareTerraformValidationWorkspaceOnce(input, dependencies).finally(() => {
      terraformValidationPreparePromises.delete(provider);
    });

    terraformValidationPreparePromises.set(provider, nextPromise);
    return nextPromise;
  }

  return prepareTerraformValidationWorkspaceOnce(input, dependencies);
}

async function prepareTerraformValidationWorkspaceOnce(
  input: TerraformValidationPrepareRequest = {},
  dependencies: PrepareTerraformValidationWorkspaceDependencies = {}
): Promise<TerraformValidationPrepareResponse> {
  const warmCache = dependencies.warmTerraformPluginCache ?? warmTerraformPluginCache;
  const homeDir = await mkdtemp(join(tmpdir(), `${terraformValidationTempPrefix}prepare-home-`));
  const cliConfigFile = join(homeDir, ".terraformrc");

  await writeFile(cliConfigFile, "", "utf8");

  const result = await warmCache({
    env: createTerraformValidationEnv(input.provider ?? "aws", {
      cliConfigFile,
      dataDir: join(homeDir, ".terraform-data"),
      homeDir
    }),
    timeoutMs: dependencies.timeoutMs ?? terraformPrepareTimeoutMs
  }).finally(async () => {
    await rm(homeDir, { force: true, recursive: true }).catch(() => undefined);
  });

  if (result.exitCode === 0 && !result.timedOut) {
    return {
      diagnostics: [],
      stage: "cli_prepare",
      status: "passed"
    };
  }

  return {
    diagnostics: [createTerraformCommandDiagnostic(result, "cli_prepare")],
    stage: "cli_prepare",
    status: "failed"
  };
}

function createStaticValidationDiagnostics(
  input: TerraformValidateRequest,
  options: { readonly includeCliSafetyChecks: boolean } = { includeCliSafetyChecks: false }
): TerraformDiagnostic[] {
  const inputDiagnostics = createTerraformValidationInputDiagnostics(input);
  const cliSafetyDiagnostics = options.includeCliSafetyChecks
    ? createTerraformCliSafetyDiagnostics(input)
    : [];
  const files = toValidationFiles(input);
  const nonEmptyFiles = files.filter((file) => file.terraformCode.trim().length > 0);

  if (nonEmptyFiles.length === 0) {
    return [
      ...inputDiagnostics,
      ...cliSafetyDiagnostics,
      ...createTerraformDiagnostics("").map((diagnostic) =>
        addDiagnosticSource(diagnostic, files[0]?.fileName ?? "main.tf")
      )
    ];
  }

  return [
    ...inputDiagnostics,
    ...cliSafetyDiagnostics,
    ...nonEmptyFiles.flatMap((file) =>
      createTerraformDiagnostics(file.terraformCode).map((diagnostic) =>
        addDiagnosticSource(diagnostic, file.fileName)
      )
    )
  ];
}

async function validateWithTerraformCli(
  input: TerraformValidateRequest,
  dependencies: ValidateTerraformPreviewCodeDependencies,
  carriedDiagnostics: readonly TerraformDiagnostic[]
): Promise<TerraformValidateResponse> {
  const rootDir = dependencies.rootDir ?? tmpdir();
  const workdir = await mkdtemp(join(rootDir, terraformValidationTempPrefix));

  try {
    const files = toValidationFiles(input).filter(
      (file) => file.terraformCode.trim().length > 0
    );

    try {
      await writeValidationFiles(workdir, files);
    } catch (error) {
      return {
        diagnostics: [
          {
            severity: "error",
            code: "terraform.validation.input",
            message: error instanceof Error
              ? maskDeploymentMessage(error.message)
              : "Terraform validation input is invalid."
          }
        ],
        mode: "full",
        stage: "static",
        status: "failed"
      };
    }

    const homeDir = join(workdir, ".terraform-home");
    const cliConfigFile = join(homeDir, ".terraformrc");

    await mkdir(homeDir, { recursive: true });
    await writeFile(cliConfigFile, "", "utf8");

    const commandOptions: RunTerraformCommandOptions = {
      env: createTerraformValidationEnv("aws", {
        cliConfigFile,
        dataDir: join(workdir, ".terraform-data"),
        homeDir
      }),
      timeoutMs: dependencies.timeoutMs ?? terraformValidationTimeoutMs
    };
    const runInit = dependencies.runTerraformInit ?? runTerraformInit;
    const initResult = await runInit(workdir, commandOptions);

    if (initResult.exitCode !== 0 || initResult.timedOut) {
      return {
        diagnostics: [createTerraformCommandDiagnostic(initResult, "cli_prepare")],
        mode: "full",
        stage: "cli_prepare",
        status: "failed"
      };
    }

    const runValidate = dependencies.runTerraformValidateJson ?? runTerraformValidateJson;
    const validateResult = await runValidate(workdir, commandOptions);
    const cliDiagnostics = parseTerraformValidateJsonDiagnostics(validateResult);
    const firstCliError = getFirstDiagnosticByValidationOrder(
      cliDiagnostics.filter((diagnostic) => diagnostic.severity === "error"),
      files
    );

    if (firstCliError) {
      return {
        diagnostics: [...carriedDiagnostics, firstCliError],
        mode: "full",
        stage: "cli_validate",
        status: "failed"
      };
    }

    if (validateResult.exitCode !== 0 || validateResult.timedOut) {
      return {
        diagnostics: [createTerraformCommandDiagnostic(validateResult, "cli_validate")],
        mode: "full",
        stage: "cli_validate",
        status: "failed"
      };
    }

    return {
      diagnostics: [...carriedDiagnostics, ...cliDiagnostics],
      mode: "full",
      stage: "cli_validate",
      status: "passed"
    };
  } finally {
    await rm(workdir, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function writeValidationFiles(
  workdir: string,
  files: readonly TerraformValidationFile[]
): Promise<void> {
  await mkdir(workdir, { recursive: true });

  const usedFileNames = new Set<string>();
  let totalBytes = 0;

  for (const file of files) {
    const fileName = toSafeTerraformValidationFileName(file.fileName, usedFileNames);
    const content = file.terraformCode;

    totalBytes += Buffer.byteLength(content);
    if (totalBytes > terraformValidationMaxBytes) {
      throw new Error(`Terraform validation input exceeds ${terraformValidationMaxBytes} bytes`);
    }

    await writeFile(join(workdir, fileName), content, "utf8");
  }

  if (usedFileNames.has(terraformProviderSupportFileName)) {
    throw new Error(`${terraformProviderSupportFileName} is reserved for Terraform validation`);
  }

  await writeFile(
    join(workdir, terraformProviderSupportFileName),
    terraformAwsProviderSupport,
    "utf8"
  );
}

function parseTerraformValidateJsonDiagnostics(
  result: TerraformRunResult
): TerraformDiagnostic[] {
  if (!result.stdout.trim()) {
    return [];
  }

  try {
    const payload = JSON.parse(result.stdout) as { diagnostics?: TerraformCliJsonDiagnostic[] };
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];

    return diagnostics.map(toTerraformDiagnostic);
  } catch {
    return [
      {
        severity: "error",
        code: "terraform.cli.validate_json",
        message: "Terraform CLI 검증 결과를 해석하지 못했습니다."
      }
    ];
  }
}

function toTerraformDiagnostic(diagnostic: TerraformCliJsonDiagnostic): TerraformDiagnostic {
  const message = [
    typeof diagnostic.summary === "string" ? diagnostic.summary : "Terraform validation error",
    typeof diagnostic.detail === "string" ? diagnostic.detail : ""
  ]
    .filter(Boolean)
    .join("; ");
  const line = typeof diagnostic.range?.start?.line === "number"
    ? diagnostic.range.start.line
    : undefined;
  const sourceFileName = typeof diagnostic.range?.filename === "string"
    ? normalizeCliDiagnosticFileName(diagnostic.range.filename)
    : undefined;

  return {
    severity: toDiagnosticSeverity(diagnostic.severity),
    code: "terraform.cli.validate",
    message: maskDeploymentMessage(message),
    ...(line !== undefined ? { line } : {}),
    ...(sourceFileName !== undefined ? { sourceFileName } : {})
  };
}

function createTerraformCommandDiagnostic(
  result: TerraformRunResult,
  stage: "cli_prepare" | "cli_validate"
): TerraformDiagnostic {
  const output = maskDeploymentMessage([result.stderr, result.stdout].filter(Boolean).join("\n"));
  const message = result.timedOut
    ? "Terraform CLI 검증 시간이 초과되었습니다."
    : output || "Terraform CLI 검증을 실행하지 못했습니다.";

  return {
    severity: "error",
    code: result.timedOut ? "terraform.cli.timeout" : `terraform.${stage}`,
    message
  };
}

function toValidationFiles(input: TerraformValidateRequest): TerraformValidationFile[] {
  if (input.terraformFiles && input.terraformFiles.length > 0) {
    return input.terraformFiles.map((file) => ({
      fileName: normalizeValidationSourceFileName(file.fileName),
      terraformCode: file.terraformCode
    }));
  }

  return [
    {
      fileName: "main.tf",
      terraformCode: input.terraformCode
    }
  ];
}

function createTerraformValidationInputDiagnostics(
  input: TerraformValidateRequest
): TerraformDiagnostic[] {
  const diagnostics: TerraformDiagnostic[] = [];
  const rawFiles = toRawValidationFiles(input);
  const usedFileNames = new Set<string>();
  let totalBytes = 0;

  if (rawFiles.length > terraformValidationMaxFileCount) {
    diagnostics.push({
      severity: "error",
      code: "terraform.validation.too_many_files",
      message: `Terraform 검증은 최대 ${terraformValidationMaxFileCount}개 파일까지만 처리합니다.`
    });
  }

  for (const file of rawFiles) {
    const sourceFileName = file.fileName;
    const baseFileName = basename(sourceFileName).trim();
    const normalizedFileName = normalizeValidationSourceFileName(sourceFileName);

    totalBytes += Buffer.byteLength(file.terraformCode);

    if (totalBytes > terraformValidationMaxBytes) {
      diagnostics.push({
        severity: "error",
        code: "terraform.validation.too_large",
        message: `Terraform 검증 입력은 최대 ${terraformValidationMaxBytes} bytes까지만 처리합니다.`,
        sourceFileName
      });
    }

    if (sourceFileName.length > terraformValidationMaxFileNameLength) {
      diagnostics.push({
        severity: "error",
        code: "terraform.validation.file_name_too_long",
        message: `Terraform 파일명은 최대 ${terraformValidationMaxFileNameLength}자까지 허용됩니다.`,
        sourceFileName
      });
    }

    if (!isSafeTerraformValidationFileName(baseFileName)) {
      diagnostics.push({
        severity: "error",
        code: "terraform.validation.file_name",
        message: "Terraform 파일명에는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
        sourceFileName
      });
    }

    if (normalizedFileName === terraformProviderSupportFileName) {
      diagnostics.push({
        severity: "error",
        code: "terraform.validation.reserved_file_name",
        message: `${terraformProviderSupportFileName} 파일명은 Terraform 검증 준비 파일로 예약되어 있습니다.`,
        sourceFileName
      });
    }

    if (usedFileNames.has(normalizedFileName)) {
      diagnostics.push({
        severity: "error",
        code: "terraform.validation.duplicate_file_name",
        message: `${normalizedFileName} 파일명이 중복되었습니다.`,
        sourceFileName
      });
    }

    usedFileNames.add(normalizedFileName);
  }

  return diagnostics;
}

function createTerraformCliSafetyDiagnostics(
  input: TerraformValidateRequest
): TerraformDiagnostic[] {
  return toRawValidationFiles(input).flatMap((file) => {
    const lines = file.terraformCode.split(/\r?\n/);

    return lines.flatMap((lineText, index) => {
      const codeLine = stripTerraformLineComment(lineText).trim();

      if (!unsupportedEditorCliBlockPattern.test(codeLine)) {
        return [];
      }

      return [
        {
          severity: "error",
          code: "terraform.validation.unsupported_cli_block",
          line: index + 1,
          message:
            "Editor CLI 검증에서는 module/provider/terraform 설정 block을 실행하지 않습니다.",
          sourceFileName: file.fileName
        } satisfies TerraformDiagnostic
      ];
    });
  });
}

function toRawValidationFiles(input: TerraformValidateRequest): TerraformValidationFile[] {
  if (input.terraformFiles && input.terraformFiles.length > 0) {
    return input.terraformFiles.map((file) => ({
      fileName: file.fileName,
      terraformCode: file.terraformCode
    }));
  }

  return [
    {
      fileName: "main.tf",
      terraformCode: input.terraformCode
    }
  ];
}

function toDiagnosticSeverity(value: unknown): TerraformDiagnostic["severity"] {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }

  return "warning";
}

function hasErrorDiagnostic(diagnostics: readonly TerraformDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function getFirstDiagnosticByValidationOrder(
  diagnostics: readonly TerraformDiagnostic[],
  files: readonly TerraformValidationFile[]
): TerraformDiagnostic | null {
  const fileOrder = new Map(files.map((file, index) => [file.fileName, index]));

  const [firstDiagnostic] = [...diagnostics].sort((left, right) => {
    const leftFileOrder = getDiagnosticFileSortIndex(left, fileOrder);
    const rightFileOrder = getDiagnosticFileSortIndex(right, fileOrder);

    if (leftFileOrder !== rightFileOrder) {
      return leftFileOrder - rightFileOrder;
    }

    return getDiagnosticSortLine(left) - getDiagnosticSortLine(right);
  });

  return firstDiagnostic ?? null;
}

function getDiagnosticFileSortIndex(
  diagnostic: TerraformDiagnostic,
  fileOrder: ReadonlyMap<string, number>
): number {
  if (!diagnostic.sourceFileName) {
    return Number.MAX_SAFE_INTEGER;
  }

  return fileOrder.get(normalizeValidationSourceFileName(diagnostic.sourceFileName)) ??
    fileOrder.get(diagnostic.sourceFileName) ??
    Number.MAX_SAFE_INTEGER;
}

function getDiagnosticSortLine(diagnostic: TerraformDiagnostic): number {
  return diagnostic.line ?? Number.MAX_SAFE_INTEGER;
}

function addDiagnosticSource(
  diagnostic: TerraformDiagnostic,
  sourceFileName: string
): TerraformDiagnostic {
  return {
    ...diagnostic,
    sourceFileName: diagnostic.sourceFileName ?? sourceFileName
  };
}

function createTerraformValidationEnv(
  provider: CloudProvider,
  options: {
    readonly cliConfigFile?: string;
    readonly dataDir?: string;
    readonly homeDir?: string;
  } = {}
): NodeJS.ProcessEnv {
  const isolatedEnv: NodeJS.ProcessEnv = {
    AWS_EC2_METADATA_DISABLED: "true",
    CHECKPOINT_DISABLE: "1",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    NO_PROXY: "",
    TF_INPUT: "0",
    ...(options.cliConfigFile !== undefined ? { TF_CLI_CONFIG_FILE: options.cliConfigFile } : {}),
    ...(options.dataDir !== undefined ? { TF_DATA_DIR: options.dataDir } : {}),
    ...(options.homeDir !== undefined
      ? {
          HOME: options.homeDir,
          USERPROFILE: options.homeDir
        }
      : {})
  };

  if (provider !== "aws") {
    return isolatedEnv;
  }

  return {
    ...isolatedEnv,
    AWS_DEFAULT_REGION: terraformValidationDefaultRegion,
    AWS_REGION: terraformValidationDefaultRegion
  };
}

function toSafeTerraformValidationFileName(fileName: string, usedFileNames: Set<string>): string {
  const sourceFileName = normalizeValidationSourceFileName(fileName);

  if (usedFileNames.has(sourceFileName)) {
    throw new Error(`Duplicate Terraform validation file name: ${sourceFileName}`);
  }

  if (sourceFileName === terraformProviderSupportFileName) {
    throw new Error(`${terraformProviderSupportFileName} is reserved for Terraform validation`);
  }

  usedFileNames.add(sourceFileName);
  return sourceFileName;
}

function normalizeValidationSourceFileName(fileName: string): string {
  const candidate = basename(fileName).trim().replace(/[^a-zA-Z0-9._-]/g, "_");

  if (!candidate || candidate === "." || candidate === "..") {
    return "main.tf";
  }

  if (candidate.endsWith(".tf") || candidate.endsWith(".tfvars")) {
    return candidate;
  }

  return `${candidate}.tf`;
}

function normalizeCliDiagnosticFileName(fileName: string): string {
  return normalizeValidationSourceFileName(fileName);
}

function isSafeTerraformValidationFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(fileName) && fileName !== "." && fileName !== "..";
}

function stripTerraformLineComment(lineText: string): string {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < lineText.length; index += 1) {
    const char = lineText[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (!inString && (char === "#" || (char === "/" && lineText[index + 1] === "/"))) {
      return lineText.slice(0, index);
    }
  }

  return lineText;
}
