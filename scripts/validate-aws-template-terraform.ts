#!/usr/bin/env tsx

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEMPLATE_IDS, type TemplateId } from "@sketchcatch/types";
import {
  runTerraformInit,
  runTerraformValidate
} from "../apps/api/src/deployments/terraform-runner.js";
import { createTemplateTerraformValidationFiles } from "../apps/api/src/services/terraform/template-terraform-validation.js";

type TemplateTerraformValidationResult = {
  readonly templateId: TemplateId;
  readonly initExitCode: number;
  readonly validateExitCode: number | null;
  readonly diagnostic: string;
};

void main();

async function main(): Promise<void> {
  const validationRoot = await mkdtemp(join(tmpdir(), "sketchcatch-template-validation-"));
  const results: TemplateTerraformValidationResult[] = [];
  const requestedTemplateIds = process.argv.slice(2).filter((value) => value !== "--");
  const templateIds = requestedTemplateIds.length > 0
    ? requestedTemplateIds.map(parseTemplateId)
    : TEMPLATE_IDS;

  try {
    for (const templateId of templateIds) {
      const startedAt = Date.now();
      const workdir = join(validationRoot, templateId);
      const files = createTemplateTerraformValidationFiles(templateId, {
        projectSlug: "validation",
        shortId: "test01"
      });

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

function parseTemplateId(value: string): TemplateId {
  const templateId = TEMPLATE_IDS.find((candidate) => candidate === value);

  if (!templateId) {
    throw new Error(`Unknown AWS template ID: ${value}`);
  }

  return templateId;
}
