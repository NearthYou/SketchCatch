#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createArchitectureBoardCompilerEvidenceReviewManifest,
  renderArchitectureBoardCompilerEvidenceReviewManifest
} from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-review-manifest";
import type { ArchitectureBoardCompilerEvidenceReport } from "../apps/web/features/architecture-board-compiler/architecture-board-compiler-evidence-report";

const mode = parseMode(process.argv.slice(2));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(
  repoRoot,
  "docs/diagram-layout-reference/compiler-evidence-report.json"
);
const reviewManifestPath = path.join(
  repoRoot,
  "docs/diagram-layout-reference/compiler-evidence-review.json"
);
const report = JSON.parse(readFileSync(reportPath, "utf8")) as ArchitectureBoardCompilerEvidenceReport;
const manifest = createArchitectureBoardCompilerEvidenceReviewManifest(report);
const output = renderArchitectureBoardCompilerEvidenceReviewManifest(manifest);

if (mode === "write") {
  writeFileSync(reviewManifestPath, output);
  console.log(`Generated ${path.relative(repoRoot, reviewManifestPath)}.`);
} else {
  const current = readFileSync(reviewManifestPath, "utf8");

  if (normalizeLineEndings(current) !== normalizeLineEndings(output)) {
    throw new Error(
      [
        "Architecture Board Compiler evidence review queue is out of date.",
        "Run `pnpm architecture-board-evidence-review:generate` after refreshing the evidence report."
      ].join("\n")
    );
  }

  console.log("Architecture Board Compiler evidence review queue is up to date.");
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
