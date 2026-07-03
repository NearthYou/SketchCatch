import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { InfrastructureGraph } from "@sketchcatch/types";
import {
  TerraformDiagramValidationError,
  renderTerraformFromInfrastructureGraph
} from "./diagram-to-terraform.js";

test("renders Terraform code from InfrastructureGraph nodes", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "main_vpc",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main"
        },
        config: {
          cidrBlock: "10.0.0.0/16",
          enableDnsSupport: true,
          enableDnsHostnames: true,
          tags: {
            Name: "main-vpc"
          }
        }
      },
      {
        id: "node-2",
        label: "public_subnet",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main"
        },
        config: {
          vpcId: "aws_vpc.main.id",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          tags: {
            Name: "public-subnet",
            "kubernetes.io/cluster/main": "owned"
          }
        }
      }
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "node-1",
        targetId: "node-2"
      }
    ]
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
    "kubernetes.io/cluster/main" = "owned"
  }
}`
  );
});

test("rejects unsafe Terraform identifiers while rendering InfrastructureGraph", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "web",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: `web" {\n}\nresource "aws_s3_bucket" "owned`,
          fileName: "main"
        },
        config: {
          ami: "ami-1234567890abcdef0"
        }
      }
    ],
    edges: []
  };

  assert.throws(
    () => renderTerraformFromInfrastructureGraph(graph),
    TerraformDiagramValidationError
  );
});

test("diagram-to-terraform renderer does not import diagram projection concerns", () => {
  const source = readFileSync(new URL("./diagram-to-terraform.ts", import.meta.url), "utf8");

  assert.equal(source.includes("DiagramJson"), false);
  assert.equal(source.includes("buildInfrastructureGraphFromDiagramJson"), false);
});
