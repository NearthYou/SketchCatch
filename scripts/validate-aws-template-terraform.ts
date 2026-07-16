#!/usr/bin/env tsx

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adaptBrainboardTemplateSource,
  brainboardTemplateRegistry,
  TEMPLATE_IDS,
  type TerraformSyncFileInput
} from "@sketchcatch/types";
import {
  runTerraformInit,
  runTerraformValidate
} from "../apps/api/src/deployments/terraform-runner.js";
import { createTemplateTerraformValidationFiles } from "../apps/api/src/services/terraform/template-terraform-validation.js";

type TemplateTerraformValidationResult = {
  readonly templateId: string;
  readonly initExitCode: number;
  readonly validateExitCode: number | null;
  readonly diagnostic: string;
};

type TemplateTerraformValidationCase = {
  readonly templateId: string;
  readonly files: readonly TerraformSyncFileInput[];
};

void main();

async function main(): Promise<void> {
  const requestedTemplateIds = new Set(
    process.argv.slice(2).filter((value) => value !== "--")
  );
  const allCases = createValidationCases();
  const knownTemplateIds = new Set(allCases.map(({ templateId }) => templateId));
  const unknownTemplateIds = [...requestedTemplateIds].filter(
    (templateId) => !knownTemplateIds.has(templateId)
  );
  const validationCases = requestedTemplateIds.size === 0
    ? allCases
    : allCases.filter(({ templateId }) => requestedTemplateIds.has(templateId));

  if (unknownTemplateIds.length > 0) {
    throw new Error(`Unknown Template ID: ${unknownTemplateIds.join(", ")}`);
  }

  const validationRoot = await mkdtemp(join(tmpdir(), "sketchcatch-template-validation-"));
  const results: TemplateTerraformValidationResult[] = [];

  try {
    for (const { files, templateId } of validationCases) {
      const startedAt = Date.now();
      const workdir = join(validationRoot, templateId);

      await mkdir(workdir, { recursive: true });

      for (const file of files) {
        await writeFile(join(workdir, file.fileName), file.terraformCode, "utf8");
      }

      process.stderr.write(`[templates:validate] ${templateId}: terraform init\n`);
      const initResult = await runTerraformInit(workdir, { timeoutMs: 120_000 });

      if (initResult.exitCode !== 0) {
        results.push({
          templateId,
          initExitCode: initResult.exitCode,
          validateExitCode: null,
          diagnostic: initResult.stderr.trim() || initResult.stdout.trim()
        });
        process.stderr.write(
          `[templates:validate] ${templateId}: init failed (${Date.now() - startedAt}ms)\n`
        );
        continue;
      }

      process.stderr.write(`[templates:validate] ${templateId}: terraform validate\n`);
      const validateResult = await runTerraformValidate(workdir, { timeoutMs: 120_000 });
      results.push({
        templateId,
        initExitCode: initResult.exitCode,
        validateExitCode: validateResult.exitCode,
        diagnostic: validateResult.stderr.trim() || validateResult.stdout.trim()
      });
      process.stderr.write(
        `[templates:validate] ${templateId}: ${validateResult.exitCode === 0 ? "passed" : "failed"} (${Date.now() - startedAt}ms)\n`
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

function createValidationCases(): readonly TemplateTerraformValidationCase[] {
  const repositoryCases = TEMPLATE_IDS.map((templateId) => ({
    templateId,
    files: createTemplateTerraformValidationFiles(templateId, {
      projectSlug: "validation",
      shortId: "test01"
    })
  }));
  const brainboardCases = brainboardTemplateRegistry.flatMap((entry) =>
    entry.status === "available"
      ? [
          {
            templateId: entry.id,
            files: adaptBrainboardTemplateSource(entry.source).terraformFiles
          }
        ]
      : []
  );

  return [...repositoryCases, ...brainboardCases];
}
