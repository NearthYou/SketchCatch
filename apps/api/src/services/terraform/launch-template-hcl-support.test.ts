import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, InfrastructureGraph } from "@sketchcatch/types";

import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

const launchTemplateValues = {
  namePrefix: "live-observation-traffic-",
  imageId: "data.aws_ssm_parameter.amazon_linux_2023.value",
  instanceType: "t3.micro",
  updateDefaultVersion: true,
  userData: 'filebase64("${path.module}/user-data.sh")',
  metadataOptions: [
    {
      httpEndpoint: "enabled",
      httpTokens: "required"
    }
  ],
  networkInterfaces: [
    {
      associatePublicIpAddress: true,
      securityGroups: ["aws_security_group.ec2_security_group.id"]
    }
  ],
  tagSpecifications: [
    {
      resourceType: "instance",
      tags: {
        Name: "live-observation-traffic"
      }
    }
  ]
};

const launchTemplateCode = `resource "aws_launch_template" "launch_template" {
  name_prefix = "live-observation-traffic-"
  image_id = data.aws_ssm_parameter.amazon_linux_2023.value
  instance_type = "t3.micro"
  update_default_version = true
  user_data = filebase64("\${path.module}/user-data.sh")

  metadata_options {
    http_endpoint = "enabled"
    http_tokens = "required"
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups = [
      aws_security_group.ec2_security_group.id,
    ]
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "live-observation-traffic"
    }
  }
}`;

test("syncs Launch Template function expressions and nested blocks", () => {
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

  const result = syncTerraformToDiagramJson(diagramJson, launchTemplateCode);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.diagramJson.nodes[0]?.parameters?.values, launchTemplateValues);
});

test("renders Launch Template function expressions and nested blocks without quoting or flattening", () => {
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
        config: launchTemplateValues
      }
    ],
    edges: []
  };

  assert.equal(
    removeBlankLines(renderTerraformFromInfrastructureGraph(graph)),
    removeBlankLines(launchTemplateCode)
  );
});

function removeBlankLines(value: string): string {
  return value
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}
