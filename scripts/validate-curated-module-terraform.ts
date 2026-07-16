#!/usr/bin/env tsx

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTerraformProviderFiles, type DiagramJson } from "@sketchcatch/types";
import {
  runTerraformInit,
  runTerraformValidate
} from "../apps/api/src/deployments/terraform-runner.js";
import { generateTerraformFromDiagramJson } from "../apps/api/src/services/terraform/terraform-preview.js";
import {
  curatedModules,
  expandCuratedModuleIntoDiagram
} from "../apps/web/features/resource-settings/module-catalog.js";

type ModuleTerraformValidationResult = {
  readonly moduleId: string;
  readonly initExitCode: number;
  readonly validateExitCode: number | null;
  readonly diagnostic: string;
};

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  variables: []
};

void main();

async function main(): Promise<void> {
  const requestedModuleIds = new Set(process.argv.slice(2).filter((value) => value !== "--"));
  const knownModuleIds = new Set(curatedModules.map(({ id }) => id));
  const unknownModuleIds = [...requestedModuleIds].filter((moduleId) => !knownModuleIds.has(moduleId));
  const modules = requestedModuleIds.size === 0
    ? curatedModules
    : curatedModules.filter(({ id }) => requestedModuleIds.has(id));

  if (unknownModuleIds.length > 0) {
    throw new Error(`Unknown Curated Module ID: ${unknownModuleIds.join(", ")}`);
  }

  const validationRoot = await mkdtemp(join(tmpdir(), "sketchcatch-module-validation-"));
  const results: ModuleTerraformValidationResult[] = [];

  try {
    for (const moduleDefinition of modules) {
      const startedAt = Date.now();
      const workdir = join(validationRoot, moduleDefinition.id);
      const diagram = expandCuratedModuleIntoDiagram({
        diagram: emptyDiagram,
        moduleId: moduleDefinition.id
      });
      const files = [
        ...createTerraformProviderFiles(diagram),
        {
          fileName: "main.tf",
          terraformCode: generateTerraformFromDiagramJson(diagram)
        }
      ];

      await mkdir(workdir, { recursive: true });
      for (const file of files) {
        await writeFile(join(workdir, file.fileName), file.terraformCode, "utf8");
      }

      process.stderr.write(`[modules:validate] ${moduleDefinition.id}: terraform init\n`);
      const initResult = await runTerraformInit(workdir, { timeoutMs: 120_000 });

      if (initResult.exitCode !== 0) {
        results.push({
          moduleId: moduleDefinition.id,
          initExitCode: initResult.exitCode,
          validateExitCode: null,
          diagnostic: initResult.stderr.trim() || initResult.stdout.trim()
        });
        continue;
      }

      process.stderr.write(`[modules:validate] ${moduleDefinition.id}: terraform validate\n`);
      const validateResult = await runTerraformValidate(workdir, { timeoutMs: 120_000 });
      results.push({
        moduleId: moduleDefinition.id,
        initExitCode: initResult.exitCode,
        validateExitCode: validateResult.exitCode,
        diagnostic: validateResult.stderr.trim() || validateResult.stdout.trim()
      });
      process.stderr.write(
        `[modules:validate] ${moduleDefinition.id}: ${validateResult.exitCode === 0 ? "passed" : "failed"} (${Date.now() - startedAt}ms)\n`
      );
    }
  } finally {
    await rm(validationRoot, { recursive: true, force: true });
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results.some((result) => result.initExitCode !== 0 || result.validateExitCode !== 0)) {
    process.exitCode = 1;
  }
}
