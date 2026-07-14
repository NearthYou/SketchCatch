import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, InfrastructureGraph } from "@sketchcatch/types";

import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { isSupportedTerraformFunctionExpression } from "./terraform-function-expressions.js";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

const policyExpression = `jsonencode({
  Version = "2012-10-17"
  Statement = [
    {
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "\${aws_s3_bucket.s3_bucket.arn}/*"
    }
  ]
})`;

const launchTemplateUserDataExpression = `base64encode(templatefile("\${path.module}/user-data.sh.tftpl", {
  traffic_api_bundle_url_json = jsonencode(var.traffic_api_bundle_url)
}))`;

test("allows complete jsonencode expressions but not arbitrary or malformed function calls", () => {
  assert.equal(isSupportedTerraformFunctionExpression(policyExpression), true);
  assert.equal(isSupportedTerraformFunctionExpression('format("%s", var.name)'), false);
  assert.equal(isSupportedTerraformFunctionExpression("jsonencode({ Version = 1 }"), false);
  assert.equal(isSupportedTerraformFunctionExpression("jsonencode({}) trailing"), false);
});

test("allows only the balanced base64encode templatefile composition", () => {
  assert.equal(
    isSupportedTerraformFunctionExpression(launchTemplateUserDataExpression),
    true
  );
  assert.equal(isSupportedTerraformFunctionExpression('base64encode("literal")'), false);
  assert.equal(
    isSupportedTerraformFunctionExpression('base64encode(file("user-data.sh"))'),
    false
  );
  assert.equal(
    isSupportedTerraformFunctionExpression(`${launchTemplateUserDataExpression} trailing`),
    false
  );
  assert.equal(
    isSupportedTerraformFunctionExpression(
      'base64encode(templatefile("user-data.sh.tftpl", {})'
    ),
    false
  );
});

test("syncs and renders the Launch Template user-data composition without quotes", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "launch-template",
        type: "aws_launch_template",
        kind: "resource",
        label: "Launch Template",
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        locked: false,
        zIndex: 0,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_launch_template",
          resourceName: "launch_template",
          fileName: "main.tf",
          values: {}
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const syncResult = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_launch_template" "launch_template" {
  user_data = ${launchTemplateUserDataExpression}
}`
  );

  assert.deepEqual(syncResult.diagnostics, []);
  assert.equal(
    syncResult.diagramJson.nodes[0]?.parameters?.values.userData,
    launchTemplateUserDataExpression
  );

  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "launch-template",
        label: "Launch Template",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_launch_template",
          resourceName: "launch_template",
          fileName: "main"
        },
        config: {
          userData: launchTemplateUserDataExpression
        }
      }
    ],
    edges: []
  };
  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /user_data = base64encode\(templatefile\(/);
  assert.doesNotMatch(terraform, /user_data = "base64encode/);
});

test("syncs an S3 bucket policy containing jsonencode without an unsupported-expression warning", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "bucket-policy",
        type: "aws_s3_bucket_policy",
        kind: "resource",
        label: "CloudFront read policy",
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        locked: false,
        zIndex: 0,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_policy",
          resourceName: "cloudfront_read",
          fileName: "main.tf",
          values: {}
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(
    diagramJson,
    `resource "aws_s3_bucket_policy" "cloudfront_read" {
  bucket = aws_s3_bucket.s3_bucket.id
  policy = ${policyExpression}
}`
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, {
    bucket: "aws_s3_bucket.s3_bucket.id",
    policy: policyExpression
  });
});

test("renders a preserved jsonencode expression without quoting it", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "bucket-policy",
        label: "CloudFront read policy",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_policy",
          resourceName: "cloudfront_read",
          fileName: "main"
        },
        config: {
          bucket: "aws_s3_bucket.s3_bucket.id",
          policy: policyExpression
        }
      }
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /policy = jsonencode\(\{/);
  assert.doesNotMatch(terraform, /policy = "jsonencode/);
});
