import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  runTerraformFormatCheck,
  type TerraformRunResult
} from "../../deployments/terraform-runner.js";
import { createTerraformDiagnostics } from "./terraform-diagnostics.js";

const terraformValidationTimeoutMs = 10_000;
const terraformValidationOutputMaxBytes = 64 * 1024;

export type CreateTerraformValidationDiagnostics = typeof createTerraformValidationDiagnostics;

export type CreateTerraformValidationDiagnosticsOptions = {
  readonly rootDir?: string;
  readonly runTerraformFormatCheck?: typeof runTerraformFormatCheck;
};

export async function createTerraformValidationDiagnostics(
  terraformCode: string,
  options: CreateTerraformValidationDiagnosticsOptions = {}
): Promise<TerraformDiagnostic[]> {
  const staticDiagnostics = createTerraformDiagnostics(terraformCode);

  if (terraformCode.trim().length === 0) {
    return staticDiagnostics;
  }

  const cliDiagnostics = await createTerraformParserDiagnostics(terraformCode, options);

  if (cliDiagnostics === null) {
    return staticDiagnostics;
  }

  if (cliDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return [
      ...cliDiagnostics,
      ...staticDiagnostics.filter((diagnostic) =>
        shouldKeepStaticDiagnosticWithParserErrors(diagnostic, cliDiagnostics)
      )
    ];
  }

  return mergeDiagnostics(cliDiagnostics, staticDiagnostics);
}

async function createTerraformParserDiagnostics(
  terraformCode: string,
  options: CreateTerraformValidationDiagnosticsOptions
): Promise<TerraformDiagnostic[] | null> {
  const workdir = await mkdtemp(join(options.rootDir ?? tmpdir(), "sketchcatch-terraform-validate-"));
  const runFormatCheck = options.runTerraformFormatCheck ?? runTerraformFormatCheck;

  try {
    await writeFile(join(workdir, "main.tf"), terraformCode, "utf8");

    const result = await runFormatCheck(workdir, {
      maxOutputBytes: terraformValidationOutputMaxBytes,
      timeoutMs: terraformValidationTimeoutMs
    });

    return diagnosticsFromTerraformFormatResult(result);
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function diagnosticsFromTerraformFormatResult(
  result: TerraformRunResult
): TerraformDiagnostic[] | null {
  if (result.exitCode === 0 || result.exitCode === 3) {
    return [];
  }

  if (result.exitCode === 127 || result.timedOut || result.cancelled) {
    return null;
  }

  const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();

  if (output.length === 0) {
    return null;
  }

  return parseTerraformCliErrors(output);
}

function parseTerraformCliErrors(output: string): TerraformDiagnostic[] {
  const chunks = output
    .split(/\r?\n(?=Error: )/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("Error: "));
  const diagnostics = chunks.map(parseTerraformCliErrorChunk).filter(isTerraformDiagnostic);

  if (diagnostics.length > 0) {
    return diagnostics;
  }

  return [
    {
      severity: "error",
      code: "terraform.cli_syntax",
      message: "Terraform parser가 문법 오류를 반환했습니다."
    }
  ];
}

function parseTerraformCliErrorChunk(chunk: string): TerraformDiagnostic | null {
  const title = /^Error:\s*(.+)$/m.exec(chunk)?.[1]?.trim();

  if (!title) {
    return null;
  }

  const lineMatch = /\bon\s+main\.tf\s+line\s+(\d+)/.exec(chunk);
  const line = lineMatch?.[1] ? Number(lineMatch[1]) : undefined;

  return {
    severity: "error",
    code: "terraform.cli_syntax",
    ...(Number.isInteger(line) ? { line } : {}),
    message: `Terraform parser: ${title}`
  };
}

function shouldKeepStaticDiagnosticWithParserErrors(
  staticDiagnostic: TerraformDiagnostic,
  cliDiagnostics: readonly TerraformDiagnostic[]
): boolean {
  if (staticDiagnostic.severity !== "error") {
    return true;
  }

  if (staticDiagnostic.line === undefined) {
    return true;
  }

  return !cliDiagnostics.some(
    (cliDiagnostic) =>
      cliDiagnostic.severity === "error" && cliDiagnostic.line === staticDiagnostic.line
  );
}

function mergeDiagnostics(
  first: readonly TerraformDiagnostic[],
  second: readonly TerraformDiagnostic[]
): TerraformDiagnostic[] {
  const merged: TerraformDiagnostic[] = [];
  const seen = new Set<string>();

  for (const diagnostic of [...first, ...second]) {
    const key = `${diagnostic.severity}:${diagnostic.code ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(diagnostic);
  }

  return merged;
}

function isTerraformDiagnostic(value: TerraformDiagnostic | null): value is TerraformDiagnostic {
  return value !== null;
}
