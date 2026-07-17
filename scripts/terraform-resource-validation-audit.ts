#!/usr/bin/env tsx

import { resourceCatalog } from "../apps/web/features/resource-settings/catalog.js";
import { terraformParameterCatalog } from "../apps/web/features/parameter-input/catalog.js";
import {
  createTerraformResourceValidationCandidates,
  renderTerraformResourceValidationAuditMarkdown,
  runTerraformResourceValidationAudit
} from "../apps/api/src/services/terraform/terraform-resource-validation-audit.js";

type CliOptions = {
  readonly format: "json" | "markdown";
  readonly includeDataSources: boolean;
  readonly keepWorkdir: boolean;
  readonly providerVersion?: string | undefined;
  readonly terraformBinary?: string | undefined;
};

void main();

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const report = await runTerraformResourceValidationAudit({
    catalog: terraformParameterCatalog,
    candidates: createTerraformResourceValidationCandidates(resourceCatalog),
    includeDataSources: options.includeDataSources,
    keepWorkdir: options.keepWorkdir,
    ...(options.providerVersion ? { providerVersion: options.providerVersion } : {}),
    ...(options.terraformBinary ? { terraformBinary: options.terraformBinary } : {})
  });

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderTerraformResourceValidationAuditMarkdown(report)}\n`);
  }

  const failures = report.results.filter(
    ({ status }) =>
      status !== "validate_passed" &&
      status !== "excluded_area_node" &&
      status !== "excluded_data_source"
  );

  if (failures.length > 0) {
    process.stderr.write(
      `[terraform:audit:validate] ${failures.length} of ${report.results.length} candidates failed Terraform validation.\n`
    );
    process.exitCode = 1;
  }
}

function parseCliOptions(args: readonly string[]): CliOptions {
  let format: CliOptions["format"] = "markdown";
  let includeDataSources = false;
  let keepWorkdir = false;
  let providerVersion: string | undefined;
  let terraformBinary: string | undefined;

  for (const arg of args) {
    if (arg === "--json") {
      format = "json";
      continue;
    }

    if (arg === "--include-data-sources") {
      includeDataSources = true;
      continue;
    }

    if (arg === "--keep-workdir") {
      keepWorkdir = true;
      continue;
    }

    if (arg.startsWith("--provider-version=")) {
      providerVersion = arg.slice("--provider-version=".length);
      continue;
    }

    if (arg.startsWith("--terraform-binary=")) {
      terraformBinary = arg.slice("--terraform-binary=".length);
    }
  }

  return {
    format,
    includeDataSources,
    keepWorkdir,
    ...(providerVersion ? { providerVersion } : {}),
    ...(terraformBinary ? { terraformBinary } : {})
  };
}
