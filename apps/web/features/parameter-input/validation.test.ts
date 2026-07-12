import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog } from "./catalog";
import type { ParameterCatalogDefinition } from "./catalog";
import {
  getActiveOptionalDefinitions,
  getMainDefinitions,
  getOptionalDefinitions,
  getRequiredDefinitions,
  getValidationDefinitions,
  mergeNodeParameters,
  validateParameters
} from "./validation";

test("getRequiredDefinitions returns only provider-required parameters", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "tags", optional: true, core: true }),
    makeDefinition({ name: "arn", computed: true })
  ];

  assert.deepEqual(
    getRequiredDefinitions(definitions).map((definition) => definition.name),
    ["cidrBlock"]
  );
});

test("getMainDefinitions includes provider-required and core parameters", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "name", optional: true, core: true }),
    makeDefinition({ name: "tags", optional: true }),
    makeDefinition({ name: "arn", computed: true })
  ];

  assert.deepEqual(
    getMainDefinitions(definitions).map((definition) => definition.name),
    ["cidrBlock", "name"]
  );
});

test("getOptionalDefinitions returns optional parameters that are not required", () => {
  const definitions = [
    makeDefinition({ name: "name", required: true }),
    makeDefinition({ name: "tags", optional: true }),
    makeDefinition({ name: "arn", computed: true }),
    makeDefinition({ name: "availabilityZone", optional: true })
  ];

  assert.deepEqual(
    getOptionalDefinitions(definitions).map((definition) => definition.name),
    ["tags", "availabilityZone"]
  );
});

test("getActiveOptionalDefinitions keeps optional definitions with stored values", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "tags", optional: true, type: "map" }),
    makeDefinition({ name: "description", optional: true }),
    makeDefinition({ name: "enableDnsHostnames", optional: true, type: "boolean" })
  ];

  assert.deepEqual(
    getActiveOptionalDefinitions(definitions, {
      cidrBlock: "10.0.0.0/16",
      tags: { Team: "platform" },
      description: "",
      enableDnsHostnames: true
    }).map((definition) => definition.name),
    ["tags", "enableDnsHostnames"]
  );
});

test("getValidationDefinitions includes required parameters and active optional values", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "tags", optional: true, type: "map" }),
    makeDefinition({ name: "description", optional: true }),
    makeDefinition({ name: "arn", computed: true })
  ];

  assert.deepEqual(
    getValidationDefinitions(definitions, {
      tags: { Name: "main" }
    }).map((definition) => definition.name),
    ["cidrBlock", "tags"]
  );
});

test("mergeNodeParameters preserves values outside the UI parameter catalog", () => {
  const node = makeResourceNode({
    parameters: {
      terraformBlockType: "resource",
      resourceType: "aws_vpc",
      resourceName: "main",
      fileName: "main",
      values: {
        cidrBlock: "10.0.0.0/16",
        rawEditorOnlyValue: "${var.raw_editor_value}"
      }
    }
  });

  assert.deepEqual(mergeNodeParameters(node, makeCatalog()).values, {
    cidrBlock: "10.0.0.0/16",
    rawEditorOnlyValue: "${var.raw_editor_value}"
  });
});

test("getValidationDefinitions ignores uncataloged raw editor values", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "tags", optional: true, type: "map" })
  ];

  assert.deepEqual(
    getValidationDefinitions(definitions, {
      rawEditorOnlyValue: "${var.raw_editor_value}"
    }).map((definition) => definition.name),
    ["cidrBlock"]
  );
});

test("validateParameters accepts ordered Auto Scaling Group capacities", () => {
  const result = validateAsgParameters({
    minSize: 1,
    desiredCapacity: 2,
    maxSize: 3
  });

  assert.equal(result.invalid, false);
  assert.deepEqual(result.parameterErrors, {});
});

test("validateParameters accepts Auto Scaling Group min and max when desired capacity is absent", () => {
  const result = validateAsgParameters({
    minSize: 1,
    maxSize: 3
  });

  assert.equal(result.invalid, false);
  assert.deepEqual(result.parameterErrors, {});
});

test("validateParameters reports Auto Scaling Group min and max ordering errors", () => {
  const result = validateAsgParameters({
    minSize: 4,
    desiredCapacity: 4,
    maxSize: 3
  });

  assert.equal(result.invalid, true);
  assert.ok(result.parameterErrors.minSize ?? result.parameterErrors.maxSize);
});

test("validateParameters reports Auto Scaling Group desired capacity below min", () => {
  const result = validateAsgParameters({
    minSize: 2,
    desiredCapacity: 1,
    maxSize: 3
  });

  assert.equal(result.invalid, true);
  assert.ok(result.parameterErrors.desiredCapacity);
});

test("validateParameters reports Auto Scaling Group desired capacity above max", () => {
  const result = validateAsgParameters({
    minSize: 1,
    desiredCapacity: 4,
    maxSize: 3
  });

  assert.equal(result.invalid, true);
  assert.ok(result.parameterErrors.desiredCapacity);
});

function makeDefinition({
  computed = false,
  core = false,
  name,
  optional = false,
  required = false,
  type = "string"
}: Partial<
  Pick<ParameterCatalogDefinition, "computed" | "core" | "optional" | "required" | "type">
> &
  Pick<ParameterCatalogDefinition, "name">): ParameterCatalogDefinition {
  return {
    name,
    terraformName: name,
    label: name,
    type,
    required,
    optional,
    computed,
    core,
    sensitive: false,
    inputKind: "text"
  };
}

function makeCatalog(): ParameterCatalog {
  return {
    provider: "aws",
    generatedAt: "2026-06-24T00:00:00.000Z",
    source: "test",
    resources: {
      aws_vpc: [
        makeDefinition({ name: "cidrBlock", required: true }),
        makeDefinition({ name: "tags", optional: true, type: "map" })
      ]
    }
  };
}

function validateAsgParameters(values: Record<string, unknown>) {
  return validateParameters(
    {
      terraformBlockType: "resource",
      resourceType: "aws_autoscaling_group",
      resourceName: "web",
      fileName: "main",
      values
    },
    [],
    [],
    "asg-1",
    makeCatalog()
  );
}

function makeResourceNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: "node-1",
    type: "aws_vpc",
    kind: "resource",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    label: "VPC",
    locked: false,
    zIndex: 0,
    ...overrides
  };
}
