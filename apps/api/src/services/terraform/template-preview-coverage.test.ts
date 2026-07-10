import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTemplateDiagramJson, templateDefinitions } from "@sketchcatch/types";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

test("all AWS templates generate Terraform Preview from their shared definitions", () => {
  for (const template of templateDefinitions) {
    const diagramJson = buildTemplateDiagramJson(template.id, {
      projectSlug: "preview",
      shortId: template.id
    });
    const terraformCode = generateTerraformFromDiagramJson(diagramJson);

    assert.ok(terraformCode.length > 0, `${template.id} generated empty Terraform`);

    for (const resource of template.resources) {
      assert.match(
        terraformCode,
        new RegExp(`resource \\"${resource.terraformResourceType}\\"`),
        `${template.id} is missing ${resource.terraformResourceType}`
      );
    }

    if (template.id === "three-tier-web-app") {
      assert.match(terraformCode, /vpc_id = aws_vpc\./);
      assert.match(terraformCode, /allocation_id = aws_eip\./);
      assert.match(terraformCode, /subnets = \[\n\s+aws_subnet\./);
    }
  }
});
