import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog, ParameterCatalogDefinition } from "../parameter-input/catalog";
import { buildResourceListItems } from "./resource-list-summary";

const catalog: ParameterCatalog = {
  provider: "aws",
  generatedAt: "2026-06-29T00:00:00.000Z",
  source: "resource-list-summary-test",
  resources: {
    aws_instance: [
      makeDefinition({ name: "subnetId", label: "Subnet", referenceTargetTypes: ["aws_subnet"], required: true }),
      makeDefinition({ name: "instanceType", label: "Instance type", optional: true })
    ],
    aws_subnet: [
      makeDefinition({ name: "vpcId", label: "VPC", referenceTargetTypes: ["aws_vpc"], required: true }),
      makeDefinition({ name: "cidrBlock", label: "CIDR block", required: true }),
      makeDefinition({ name: "availabilityZone", label: "Availability zone", optional: true })
    ],
    aws_vpc: [makeDefinition({ name: "cidrBlock", label: "CIDR block", required: true })]
  }
};

test("buildResourceListItems includes Terraform resources and design area nodes", () => {
  const items = buildResourceListItems(
    [
      makeResourceNode({ id: "subnet-1", resourceType: "aws_subnet" }),
      makeResourceNode({ id: "region-1", label: "Region", resourceType: "aws_region" }),
      makeDesignNode({ id: "note-1", label: "Note", type: "sketchcatch_note" })
    ],
    catalog
  );

  assert.deepEqual(
    items.map((item) => item.nodeId),
    ["subnet-1", "region-1"]
  );
  assert.equal(items[0]?.typeLabel, "aws_subnet");
  assert.equal(items[1]?.typeLabel, "Area / Region");
  assert.equal(items[1]?.terraformAddress, undefined);
});

test("buildResourceListItems orders reference rows before required and active optional values", () => {
  const items = buildResourceListItems(
    [
      makeResourceNode({
        id: "subnet-1",
        resourceName: "public_subnet",
        resourceType: "aws_subnet",
        values: {
          availabilityZone: "ap-northeast-2a",
          cidrBlock: "10.0.1.0/24",
          vpcId: "aws_vpc.main.id"
        }
      })
    ],
    catalog
  );

  assert.deepEqual(
    items[0]?.rows.map((row) => [row.key, row.kind, row.value]),
    [
      ["vpcId", "reference", "aws_vpc.main.id"],
      ["cidrBlock", "required", "10.0.1.0/24"],
      ["availabilityZone", "optional", "ap-northeast-2a"]
    ]
  );
});

test("buildResourceListItems summarizes Region nodes with the selected AWS Region", () => {
  const regionNode = makeResourceNode({
    id: "region-1",
    label: "Production Region",
    resourceName: "primary",
    resourceType: "aws_region",
    values: {
      awsRegion: "ap-northeast-1"
    }
  });
  const items = buildResourceListItems(
    [regionNode],
    catalog
  );

  assert.equal(items[0]?.displayName, "Production Region");
  assert.deepEqual(items[0]?.rows, [
    {
      key: "awsRegion",
      kind: "metadata",
      label: "Region",
      value: "Asia Pacific (Tokyo)"
    }
  ]);
});

test("buildResourceListItems summarizes AZ nodes with the selected availability zone", () => {
  const items = buildResourceListItems(
    [
      makeResourceNode({
        id: "az-1",
        label: "Public AZ",
        resourceName: "public_a",
        resourceType: "aws_availability_zone",
        values: {
          awsAvailabilityZone: "us-east-1c"
        }
      })
    ],
    catalog
  );

  assert.equal(items[0]?.displayName, "Public AZ");
  assert.equal(items[0]?.terraformAddress, undefined);
  assert.deepEqual(items[0]?.rows, [
    {
      key: "awsAvailabilityZone",
      kind: "metadata",
      label: "Availability Zone",
      value: "US East (N. Virginia) / us-east-1c"
    }
  ]);
});

test("buildResourceListItems marks resources invalid when required values are missing", () => {
  const items = buildResourceListItems(
    [
      makeResourceNode({
        id: "subnet-1",
        resourceName: "public_subnet",
        resourceType: "aws_subnet",
        values: {
          vpcId: "aws_vpc.main.id"
        }
      })
    ],
    catalog
  );

  assert.equal(items[0]?.status, "invalid");
});

test("buildResourceListItems falls back when legacy resourceName is missing", () => {
  const legacyNode = makeLegacyResourceNodeWithoutResourceName({
    id: "vpc-1",
    label: "Legacy VPC",
    resourceType: "aws_vpc"
  });

  const items = buildResourceListItems([legacyNode], catalog);

  assert.equal(items[0]?.displayName, "Legacy VPC");
  assert.equal(items[0]?.terraformAddress, undefined);
});

test("buildResourceListItems omits terraformAddress when resourceName is blank", () => {
  const items = buildResourceListItems(
    [
      makeResourceNode({
        id: "subnet-1",
        label: "Blank Subnet",
        resourceName: "  ",
        resourceType: "aws_subnet"
      })
    ],
    catalog
  );

  assert.equal(items[0]?.terraformAddress, undefined);
});

function makeDefinition({
  label,
  name,
  optional = false,
  referenceTargetTypes,
  required = false,
  terraformName = name,
  type = "string"
}: Partial<
  Pick<
    ParameterCatalogDefinition,
    "label" | "optional" | "referenceTargetTypes" | "required" | "terraformName" | "type"
  >
> &
  Pick<ParameterCatalogDefinition, "name">): ParameterCatalogDefinition {
  return {
    name,
    terraformName,
    label: label ?? name,
    type,
    required,
    optional,
    computed: false,
    sensitive: false,
    description: "",
    inputKind: referenceTargetTypes ? "reference-picker" : "text",
    referenceTargetTypes
  };
}

function makeResourceNode({
  id,
  label = "Subnet",
  resourceName = "resource_name",
  resourceType,
  values = {}
}: {
  id: string;
  label?: string;
  resourceName?: string;
  resourceType: string;
  values?: Record<string, unknown>;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    label,
    locked: false,
    zIndex: 0,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "main",
      values
    }
  };
}

function makeDesignNode({
  id,
  label,
  metadata,
  type
}: {
  id: string;
  label: string;
  metadata?: DiagramNode["metadata"];
  type: string;
}): DiagramNode {
  return {
    id,
    type,
    kind: "design",
    position: { x: 0, y: 0 },
    size: { width: 320, height: 220 },
    label,
    locked: false,
    zIndex: 0,
    metadata
  };
}

function makeLegacyResourceNodeWithoutResourceName({
  id,
  label,
  resourceType
}: {
  id: string;
  label: string;
  resourceType: string;
}): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    label,
    locked: false,
    zIndex: 0,
    parameters: {
      terraformBlockType: "resource",
      resourceType,
      fileName: "main",
      values: {}
    }
  } as unknown as DiagramNode;
}
