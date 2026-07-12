import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, InfrastructureGraph } from "@sketchcatch/types";

import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

const targetGroupValues = {
  name: "live-observation-traffic",
  port: 3000,
  protocol: "HTTP",
  targetType: "instance",
  vpcId: "aws_vpc.vpc.id",
  deregistrationDelay: 30,
  healthCheck: {
    enabled: true,
    protocol: "HTTP",
    port: "traffic-port",
    path: "/health",
    matcher: "200",
    interval: 15,
    timeout: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 2
  },
  tags: {
    Name: "live-observation-traffic"
  }
};

const targetGroupCode = `resource "aws_lb_target_group" "target_group" {
  name = "live-observation-traffic"
  port = 3000
  protocol = "HTTP"
  target_type = "instance"
  vpc_id = aws_vpc.vpc.id
  deregistration_delay = 30

  health_check {
    enabled = true
    protocol = "HTTP"
    port = "traffic-port"
    path = "/health"
    matcher = "200"
    interval = 15
    timeout = 5
    healthy_threshold = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "live-observation-traffic"
  }
}`;

test("syncs the supported Target Group settings into an editable single health check block", () => {
  const diagramJson: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const result = syncTerraformToDiagramJson(diagramJson, targetGroupCode);
  const proposal = result.proposals?.find((item) => item.kind === "create_candidate");

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(proposal?.parameters.values, targetGroupValues);
});

test("renders the supported Target Group settings without flattening the health check block", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "target-group",
        label: "Target Group",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_lb_target_group",
          resourceName: "target_group",
          fileName: "main"
        },
        config: targetGroupValues
      }
    ],
    edges: []
  };

  assert.equal(removeBlankLines(renderTerraformFromInfrastructureGraph(graph)), removeBlankLines(targetGroupCode));
});

function removeBlankLines(value: string): string {
  return value
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}
