import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleDiagramTerraform } from "../../app/workspace/workspace-options";

test("sampleDiagramTerraform matches the sample DiagramJson conversion output", () => {
  assert.equal(
    sampleDiagramTerraform,
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
  }
}`
  );
});
