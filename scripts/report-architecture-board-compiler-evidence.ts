#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createArchitectureBoardCompilerEvidenceReport,
  renderArchitectureBoardCompilerEvidenceReport
} from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-report";
import {
  parseArchitectureBoardCompilerEvidenceBaseline
} from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-baseline";
import { collectArchitectureBoardCompilerEvidenceInput } from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-source";

const mode = parseMode(process.argv.slice(2));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(
  repoRoot,
  "apps/web/test-fixtures/architecture-board-layout/compiler-evidence-report.json"
);
const baselinePath = path.join(
  repoRoot,
  "apps/web/test-fixtures/architecture-board-layout/compiler-evidence-baseline.json"
);
const baseline = parseArchitectureBoardCompilerEvidenceBaseline(
  JSON.parse(readFileSync(baselinePath, "utf8")) as unknown
);
const report = createArchitectureBoardCompilerEvidenceReport(
  collectArchitectureBoardCompilerEvidenceInput(),
  { aggregateAfterVisualAnomalyBudget: baseline.aggregateAfterVisualAnomalyBudget }
);

if (baseline.compilerVersion !== report.compilerVersion) {
  throw new Error(
    [
      `Architecture Board Compiler evidence baseline expects ${baseline.compilerVersion},`,
      `but the generated report is ${report.compilerVersion}.`,
      "Review and intentionally update compiler-evidence-baseline.json with the new report diff."
    ].join("\n")
  );
}

if (report.regressionGuard?.violations.length) {
  throw new Error(
    [
      "Architecture Board Compiler aggregate visual anomaly budget regressed.",
      ...report.regressionGuard.violations.map(
        ({ actual, maximum, metric }) => `- ${metric}: ${actual} exceeds recorded maximum ${maximum}`
      ),
      "Do not rewrite the baseline automatically. Review the report diff and deliberately update compiler-evidence-baseline.json with rationale only when the regression is accepted."
    ].join("\n")
  );
}
const output = renderArchitectureBoardCompilerEvidenceReport(
  report
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
