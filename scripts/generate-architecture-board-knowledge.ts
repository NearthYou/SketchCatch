#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createArchitectureBoardKnowledgeArtifactFromSource,
  renderArchitectureBoardKnowledgeArtifact
} from "../apps/web/features/architecture-board-compiler/architecture-board-knowledge-source-generator";

const mode = parseMode(process.argv.slice(2));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(
  repoRoot,
  "apps/web/features/architecture-board-compiler/architecture-board-knowledge.generated.ts"
);
const output = renderArchitectureBoardKnowledgeArtifact(
  createArchitectureBoardKnowledgeArtifactFromSource()
);

if (mode === "write") {
  writeFileSync(artifactPath, output);
  console.log(`Generated ${path.relative(repoRoot, artifactPath)}.`);
} else {
  const current = readFileSync(artifactPath, "utf8");

  if (normalizeLineEndings(current) !== normalizeLineEndings(output)) {
    throw new Error(
      [
        "Architecture Board knowledge artifact is out of date.",
        "Run `pnpm architecture-board-knowledge:generate` and review the diff."
      ].join("\n")
    );
  }

  console.log("Architecture Board knowledge artifact is up to date.");
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
