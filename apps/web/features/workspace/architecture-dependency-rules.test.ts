import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createArchitectureRuleInputFingerprint,
  evaluateArchitectureDependencies
} from "@sketchcatch/types/architecture-dependency-rules";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";

test("architecture evaluator is deterministic for an empty diagram", () => {
  const diagram = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(evaluateArchitectureDependencies(diagram, "preview"), []);
  assert.equal(
    createArchitectureRuleInputFingerprint(diagram),
    createArchitectureRuleInputFingerprint(diagram)
  );
});

test("preview reports a missing containment parent without stopping other evaluation", () => {
  const diagnostics = evaluateArchitectureDependencies(
    diagramWith(subnetNode({ parentAreaNodeId: "missing-vpc" })),
    "preview"
  );

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "architecture.graph.parent_missing",
    "architecture.aws.subnet.vpc_reference_missing",
    "architecture.aws.subnet.vpc_context_missing"
  ]);
});

test("a presentation AZ between a Subnet and its referenced VPC is transparent", () => {
  // Presentation-only containers may refine the Board hierarchy without changing Terraform context.
  const vpc = vpcNode();
  const availabilityZone: DiagramNode = {
    id: "az-presentation",
    type: "aws-availability-zone",
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    label: "AZ A",
    locked: false,
    zIndex: 0,
    metadata: {
      parentAreaNodeId: vpc.id,
      presentationCatalogItemId: "aws-availability-zone"
    }
  };
  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: availabilityZone.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: { vpcId: "aws_vpc.main.id" }
  });

  assert.equal(
    evaluateArchitectureDependencies(diagramWith(vpc, availabilityZone, subnet), "preview").some(
      (diagnostic) => diagnostic.code === "architecture.aws.subnet.vpc_context_missing"
    ),
    false
  );
});

test("a Subnet whose presentation ancestry disagrees with its VPC reference still warns", () => {
  // Ignoring presentation containers must not accept a different Terraform Resource ancestor.
  const referencedVpc = vpcNode();
  const containingVpc = resourceNode({
    id: "vpc-2",
    resourceName: "other",
    resourceType: "aws_vpc",
    values: { cidrBlock: "10.1.0.0/16" }
  });
  const availabilityZone: DiagramNode = {
    id: "az-presentation",
    type: "aws-availability-zone",
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    label: "AZ A",
    locked: false,
    zIndex: 0,
    metadata: {
      parentAreaNodeId: containingVpc.id,
      presentationCatalogItemId: "aws-availability-zone"
    }
  };
  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: availabilityZone.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: { vpcId: "aws_vpc.main.id" }
  });

  assert.equal(
    evaluateArchitectureDependencies(
      diagramWith(referencedVpc, containingVpc, availabilityZone, subnet),
      "preview"
    ).some((diagnostic) => diagnostic.code === "architecture.aws.subnet.vpc_context_missing"),
    true
  );
});

test("a fresh EC2 outside a relevant area is silent in contextual mode", () => {
  assert.deepEqual(evaluateArchitectureDependencies(diagramWith(ec2Node()), "contextual"), []);
});

test("EC2 in a VPC without AMI or subnet yields actionable warnings", () => {
  const diagnostics = evaluateArchitectureDependencies(
    diagramWith(vpcNode(), ec2Node({ parentAreaNodeId: "vpc-1" })),
    "contextual"
  );

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "architecture.aws.ec2.ami_reference_missing",
    "architecture.aws.ec2.subnet_context_missing"
  ]);
});

test("EC2 in a VPC-contained subnet with matching references is clean", () => {
  const diagnostics = evaluateArchitectureDependencies(validEc2Architecture(), "preview");

  assert.equal(diagnostics.filter((diagnostic) => diagnostic.resourceNodeId === "ec2-1").length, 0);
});

test("nested area ancestors satisfy matching VPC and subnet references", () => {
  const vpc = vpcNode();
  const availabilityZone = resourceNode({
    id: "az-1",
    metadata: { parentAreaNodeId: vpc.id },
    resourceName: "ap_northeast_2a",
    resourceType: "aws_availability_zone",
    values: { awsAvailabilityZone: "ap-northeast-2a" }
  });
  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: availabilityZone.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: { vpcId: "aws_vpc.main.id" }
  });
  const ami = amiNode();
  const ec2 = resourceNode({
    id: "ec2-1",
    metadata: { parentAreaNodeId: subnet.id },
    resourceName: "app",
    resourceType: "aws_instance",
    values: {
      ami: "data.aws_ami.al2023.id",
      subnetId: "aws_subnet.public.id"
    }
  });

  assert.deepEqual(
    evaluateArchitectureDependencies(diagramWith(vpc, availabilityZone, subnet, ami, ec2), "preview"),
    []
  );
});

test("physical VPC containment satisfies a Subnet that is grouped by Availability Zone", () => {
  const vpc = vpcNode();
  vpc.position = { x: 0, y: 0 };
  vpc.size = { width: 800, height: 600 };

  const availabilityZone = resourceNode({
    id: "az-1",
    resourceName: "ap_northeast_2a",
    resourceType: "aws_availability_zone",
    values: { awsAvailabilityZone: "ap-northeast-2a" }
  });
  availabilityZone.position = { x: 0, y: 800 };
  availabilityZone.size = { width: 300, height: 200 };

  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: availabilityZone.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: {
      availabilityZone: "ap-northeast-2a",
      cidrBlock: "10.0.1.0/24",
      vpcId: "aws_vpc.main.id"
    }
  });
  subnet.position = { x: 100, y: 100 };
  subnet.size = { width: 200, height: 150 };

  assert.deepEqual(
    evaluateArchitectureDependencies(diagramWith(vpc, availabilityZone, subnet), "preview"),
    []
  );

  subnet.position = { x: 700, y: 500 };

  assert.deepEqual(
    evaluateArchitectureDependencies(diagramWith(vpc, availabilityZone, subnet), "preview")
      .map((diagnostic) => diagnostic.code),
    ["architecture.aws.subnet.vpc_context_missing"]
  );
});

test("EC2 accepts a referenced Subnet nested beneath a presentation AZ", () => {
  const vpc = vpcNode();
  const availabilityZone: DiagramNode = {
    id: "az-presentation",
    type: "aws-availability-zone",
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    label: "AZ A",
    locked: false,
    zIndex: 0,
    metadata: {
      parentAreaNodeId: vpc.id,
      presentationCatalogItemId: "aws-availability-zone"
    }
  };
  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: availabilityZone.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: { vpcId: "aws_vpc.main.id" }
  });
  const ami = amiNode();
  const ec2 = resourceNode({
    id: "ec2-1",
    metadata: { parentAreaNodeId: subnet.id },
    resourceName: "app",
    resourceType: "aws_instance",
    values: {
      ami: "data.aws_ami.al2023.id",
      subnetId: "aws_subnet.public.id"
    }
  });
  const diagnostics = evaluateArchitectureDependencies(
    diagramWith(vpc, availabilityZone, subnet, ami, ec2),
    "preview"
  );

  assert.equal(diagnostics.filter((diagnostic) => diagnostic.resourceNodeId === ec2.id).length, 0);
});

function diagramWith(...nodes: DiagramNode[]): DiagramJson {
  return {
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function vpcNode(): DiagramNode {
  return resourceNode({
    id: "vpc-1",
    resourceName: "main",
    resourceType: "aws_vpc",
    values: { cidrBlock: "10.0.0.0/16" }
  });
}

function subnetNode({ parentAreaNodeId }: { parentAreaNodeId?: string } = {}): DiagramNode {
  return resourceNode({
    id: "subnet-1",
    metadata: parentAreaNodeId ? { parentAreaNodeId } : undefined,
    resourceName: "public",
    resourceType: "aws_subnet",
    values: {}
  });
}

function ec2Node({ parentAreaNodeId }: { parentAreaNodeId?: string } = {}): DiagramNode {
  return resourceNode({
    id: "ec2-1",
    metadata: parentAreaNodeId ? { parentAreaNodeId } : undefined,
    resourceName: "app",
    resourceType: "aws_instance",
    values: {}
  });
}

function amiNode(): DiagramNode {
  return resourceNode({
    id: "ami-1",
    resourceName: "al2023",
    resourceType: "aws_ami",
    terraformBlockType: "data",
    values: {}
  });
}

function validEc2Architecture(): DiagramJson {
  const vpc = vpcNode();
  const subnet = resourceNode({
    id: "subnet-1",
    metadata: { parentAreaNodeId: vpc.id },
    resourceName: "public",
    resourceType: "aws_subnet",
    values: { vpcId: "aws_vpc.main.id" }
  });
  const ami = amiNode();
  const ec2 = resourceNode({
    id: "ec2-1",
    metadata: { parentAreaNodeId: subnet.id },
    resourceName: "app",
    resourceType: "aws_instance",
    values: {
      ami: "data.aws_ami.al2023.id",
      subnetId: "aws_subnet.public.id"
    }
  });

  return diagramWith(vpc, subnet, ami, ec2);
}

function resourceNode({
  id,
  metadata,
  resourceName,
  resourceType,
  terraformBlockType = "resource",
  values
}: {
  id: string;
  metadata?: DiagramNode["metadata"];
  resourceName: string;
  resourceType: string;
  terraformBlockType?: "data" | "resource";
  values: Record<string, unknown>;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    label: resourceType,
    locked: false,
    zIndex: 0,
    metadata,
    parameters: {
      terraformBlockType,
      resourceType,
      resourceName,
      fileName: "main",
      values
    }
  };
}
