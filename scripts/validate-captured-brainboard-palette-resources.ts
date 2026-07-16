#!/usr/bin/env tsx

import { resourceCatalog } from "../apps/web/features/resource-settings/catalog.js";
import { capturedBrainboardPaletteResourceIds } from "../apps/web/features/resource-settings/captured-brainboard-palette-resource-ids.js";
import { terraformParameterCatalog } from "../apps/web/features/parameter-input/catalog.js";
import {
  createTerraformResourceValidationCandidates,
  renderTerraformResourceValidationAuditMarkdown,
  runTerraformResourceValidationAudit
} from "../apps/api/src/services/terraform/terraform-resource-validation-audit.js";

// Generated SketchCatch roots use the same constraint; the audit must resolve the provider
// schema from that deployment line instead of validating against a different major version.
const providerVersion = "~> 5.0";

void main();

async function main(): Promise<void> {
  const requestedIds = new Set<string>(capturedBrainboardPaletteResourceIds);
  const candidates = createTerraformResourceValidationCandidates(resourceCatalog).filter(
    ({ definitionId }) => requestedIds.has(definitionId)
  );
  const actualIds = new Set(candidates.map(({ definitionId }) => definitionId));
  const missingIds = capturedBrainboardPaletteResourceIds.filter((id) => !actualIds.has(id));

  if (missingIds.length > 0 || candidates.length !== capturedBrainboardPaletteResourceIds.length) {
    throw new Error(
      `Captured Brainboard Palette audit scope mismatch: ${missingIds.join(", ") || "duplicate candidates"}`
    );
  }

  const report = await runTerraformResourceValidationAudit({
    candidates,
    catalog: terraformParameterCatalog,
    includeDataSources: true,
    providerVersion,
    timeoutMs: 120_000
  });

  process.stdout.write(`${renderTerraformResourceValidationAuditMarkdown(report)}\n`);

  const failures = report.results.filter(({ status }) => status !== "validate_passed");
  if (failures.length > 0 || report.results.length !== candidates.length) {
    process.stderr.write(
      `[captured-palette:validate] ${failures.length} of ${candidates.length} resources failed provider-schema Terraform validation.\n`
    );
    process.exitCode = 1;
  }
}
