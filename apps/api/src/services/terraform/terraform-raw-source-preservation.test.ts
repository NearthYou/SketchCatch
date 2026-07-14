import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { createTerraformDiagnostics } from "./terraform-diagnostics.js";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

const exactVariableBlock = `variable "traffic_api_bundle_url" {
  description = "Prebuilt traffic API bundle HTTPS URL"
  type        = string

  validation {
    condition     = startswith(var.traffic_api_bundle_url, "https://")
    error_message = "traffic_api_bundle_url must use HTTPS."
  }
}`;

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("keeps the traffic API variable block nonblocking and out of the Architecture Board", () => {
  const validationDiagnostics = createTerraformDiagnostics(exactVariableBlock);
  const syncResult = syncTerraformToDiagramJson(emptyDiagram, exactVariableBlock);

  assert.deepEqual(validationDiagnostics, []);
  assert.deepEqual(syncResult.diagnostics, []);
  assert.deepEqual(syncResult.proposals, []);
  assert.deepEqual(syncResult.diagramJson.nodes, []);
});

test("silently preserves locals and output blocks outside the Architecture Board", () => {
  const code = `locals {
  service_name = "traffic-api"
}

output "service_name" {
  value = local.service_name
}`;

  assert.deepEqual(createTerraformDiagnostics(code), []);

  const syncResult = syncTerraformToDiagramJson(emptyDiagram, code);

  assert.deepEqual(syncResult.diagnostics, []);
  assert.deepEqual(syncResult.proposals, []);
  assert.deepEqual(syncResult.diagramJson.nodes, []);
});

test("keeps module blocks visible because their infrastructure is not projected", () => {
  const code = `module "network" {
  source = "./network"
}`;

  assert.equal(
    createTerraformDiagnostics(code).some(
      (diagnostic) => diagnostic.code === "terraform.unsupported_block"
    ),
    true
  );
  assert.equal(
    syncTerraformToDiagramJson(emptyDiagram, code).diagnostics.some(
      (diagnostic) => diagnostic.code === "terraform.sync.unsupported_block"
    ),
    true
  );
});

test("does not partially mutate a known resource containing an unsupported expression", () => {
  const diagram: DiagramJson = {
    ...emptyDiagram,
    nodes: [{
      id: "vpc-1",
      type: "aws_vpc",
      kind: "resource",
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      label: "VPC",
      locked: false,
      zIndex: 1,
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main",
        fileName: "main.tf",
        values: { cidrBlock: "10.0.0.0/16", enableDnsSupport: true }
      }
    }]
  };
  const result = syncTerraformToDiagramJson(diagram, `resource "aws_vpc" "main" {
  cidr_block         = var.use_alt ? "10.0.0.0/16" : "10.1.0.0/16"
  enable_dns_support = false
}`);

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
  assert.deepEqual(result.proposals, []);
  assert.deepEqual(result.diagramJson, diagram);
});

test("still blocks an unclosed Terraform block", () => {
  const code = `variable "traffic_api_bundle_url" {\n  type = string`;

  assert.equal(createTerraformDiagnostics(code).some((diagnostic) => diagnostic.severity === "error"), true);
  assert.equal(syncTerraformToDiagramJson(emptyDiagram, code).diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  ), true);
});

test("parses the exact target tracking predefined ALB metric structure", () => {
  const result = syncTerraformToDiagramJson(emptyDiagram, `resource "aws_autoscaling_policy" "requests" {
  name                   = "requests"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    target_value     = 1000
    disable_scale_in = false

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "\${aws_lb.load_balancer.arn_suffix}/\${aws_lb_target_group.target_group.arn_suffix}"
    }
  }
}`);
  const createProposal = result.proposals?.find((proposal) => proposal.kind === "create_candidate");

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
  assert.deepEqual(createProposal?.parameters.values.targetTrackingConfiguration, [{
    targetValue: 1000,
    disableScaleIn: false,
    predefinedMetricSpecification: [{
      predefinedMetricType: "ALBRequestCountPerTarget",
      resourceLabel: "${aws_lb.load_balancer.arn_suffix}/${aws_lb_target_group.target_group.arn_suffix}"
    }]
  }]);
});
