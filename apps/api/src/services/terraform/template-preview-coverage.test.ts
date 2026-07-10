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
        new RegExp(`(?:resource|data) \\"${resource.terraformResourceType}\\"`),
        `${template.id} is missing ${resource.terraformResourceType}`
      );
    }

    if (template.id === "static-web-hosting") {
      assert.match(terraformCode, /origin_access_control_origin_type = "s3"/);
      assert.doesNotMatch(terraformCode, /\n\s+origin_type =/);
    }

    if (template.id === "minimal-serverless-api") {
      assert.match(terraformCode, /parent_id = aws_api_gateway_rest_api\..*\.root_resource_id/);
    }

    if (template.id === "three-tier-web-app") {
      assert.match(terraformCode, /vpc_id = aws_vpc\./);
      assert.match(terraformCode, /allocation_id = aws_eip\./);
      assert.match(terraformCode, /subnets = \[\n\s+aws_subnet\./);
      assert.match(terraformCode, /image_id = data\.aws_ami\..*\.id/);
    }

    if (template.id === "eks-container-app") {
      assert.match(
        terraformCode,
        /resource "kubernetes_deployment"[\s\S]*selector \{[\s\S]*match_labels = \{/
      );
      assert.match(
        terraformCode,
        /resource "kubernetes_service"[\s\S]*selector = \{[\s\S]*app = "web"/
      );
    }
  }
});
