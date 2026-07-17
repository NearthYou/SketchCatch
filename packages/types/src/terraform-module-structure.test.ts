import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findTerraformRequiredProvidersBlockLocations,
  findTerraformRequiredProvidersDeclarations
} from "./terraform-module-structure.ts";

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

test("findTerraformRequiredProvidersBlockLocations returns the editable block body", () => {
  const terraformCode = `terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
  }
}`;
  const [location] = findTerraformRequiredProvidersBlockLocations([
    { fileName: "providers.tf", terraformCode }
  ]);

  assert.ok(location);
  assert.equal(
    terraformCode.slice(location.bodyStartOffset, location.bodyEndOffset),
    `
    aws = { source = "hashicorp/aws" }
  `
  );
});
