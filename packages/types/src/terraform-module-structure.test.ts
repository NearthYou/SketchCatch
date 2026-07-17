import assert from "node:assert/strict";
import { test } from "node:test";
import { findTerraformRequiredProvidersDeclarations } from "./terraform-module-structure.ts";

test("findTerraformRequiredProvidersDeclarations only returns structural module blocks", () => {
  const declarations = findTerraformRequiredProvidersDeclarations([
    {
      fileName: "main.tf",
      terraformCode: `# required_providers { ignored = true }
locals {
  label = "required_providers { ignored = true }"
  script = <<-SCRIPT
terraform {
  required_providers { ignored = true }
}
SCRIPT
}

terraform { required_providers { aws = { source = "hashicorp/aws" } } }`
    }
  ]);

  assert.deepEqual(declarations, [{ fileName: "main.tf", line: 11 }]);
});
