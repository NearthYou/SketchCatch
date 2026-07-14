#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createArchitectureBoardCompilerEvidenceReport,
  renderArchitectureBoardCompilerEvidenceReport
} from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-report";
import { collectArchitectureBoardCompilerEvidenceInput } from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-source";

const mode = parseMode(process.argv.slice(2));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(
  repoRoot,
  "docs/diagram-layout-reference/compiler-evidence-report.json"
);
const output = renderArchitectureBoardCompilerEvidenceReport(
  createArchitectureBoardCompilerEvidenceReport(collectArchitectureBoardCompilerEvidenceInput())
);

if (mode === "write") {
  writeFileSync(reportPath, output);
  console.log(`Generated ${path.relative(repoRoot, reportPath)}.`);
} else {
  const current = readFileSync(reportPath, "utf8");

  if (normalizeLineEndings(current) !== normalizeLineEndings(output)) {
    throw new Error(
      [
        "Architecture Board Compiler evidence report is out of date.",
        "Run `pnpm --dir apps/web exec tsx ../../scripts/report-architecture-board-compiler-evidence.ts --write` and review the diff."
      ].join("\n")
    );
  }

  console.log("Architecture Board Compiler evidence report is up to date.");
}

function parseMode(arguments_: readonly string[]): "write" | "check" {
  if (arguments_.length !== 1 || (arguments_[0] !== "--write" && arguments_[0] !== "--check")) {
    throw new Error("Use exactly one of --write or --check.");
  }

  return arguments_[0] === "--write" ? "write" : "check";
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
