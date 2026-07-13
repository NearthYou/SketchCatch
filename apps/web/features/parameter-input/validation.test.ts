import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog } from "./catalog";
import type { ParameterCatalogDefinition } from "./catalog";
import { terraformParameterCatalog } from "./catalog";
import {
  buildReferenceOptions,
  getActiveOptionalDefinitions,
  getMainDefinitions,
  getOptionalDefinitions,
  getRequiredDefinitions,
  getValidationDefinitions,
  mergeNodeParameters,
  validateParameters
} from "./validation";

test("Launch Template AMI options use the target-specific Terraform attribute", () => {
  const imageIdDefinition = terraformParameterCatalog.resources.aws_launch_template?.find(
    (definition) => definition.name === "imageId"
  );
  assert.ok(imageIdDefinition);

  const launchTemplate = makeResourceNode({
    id: "launch-template",
    type: "aws_launch_template",
    label: "LAUNCH TEMPLATE",
    parameters: {
      resourceType: "aws_launch_template",
      resourceName: "traffic",
      fileName: "main",
      values: {}
    }
  });
  const ami = makeResourceNode({
    id: "ami",
    type: "aws_ami",
    label: "AMI",
    parameters: {
      terraformBlockType: "data",
      resourceType: "aws_ami",
      resourceName: "al2023",
      fileName: "main",
      values: {}
    }
  });
  const ssmParameter = makeResourceNode({
    id: "ssm-parameter",
    type: "aws_ssm_parameter",
    label: "AMAZON LINUX 2023",
    parameters: {
      terraformBlockType: "data",
      resourceType: "aws_ssm_parameter",
      resourceName: "amazon_linux_2023",
      fileName: "main",
      values: {}
    }
  });

  assert.deepEqual(
    buildReferenceOptions(
      [launchTemplate, ami, ssmParameter],
      launchTemplate.id,
      imageIdDefinition,
      terraformParameterCatalog
    ).map((option) => option.reference),
    ["data.aws_ami.al2023.id", "data.aws_ssm_parameter.amazon_linux_2023.value"]
  );
});

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

test("mergeNodeParameters preserves blank editable metadata while the user types", () => {
  const node = makeResourceNode({
    label: "main",
    parameters: {
      terraformBlockType: "resource",
      resourceType: "aws_vpc",
      resourceName: "",
      fileName: "",
      values: {}
    }
  });

  const merged = mergeNodeParameters(node, makeCatalog());
  const validation = validateParameters(merged, [], [node], node.id, makeCatalog());

  assert.equal(merged.resourceName, "");
  assert.equal(merged.fileName, "");
  assert.equal(validation.metadataErrors.resourceName, "Terraform resource name은 필수입니다.");
  assert.equal(validation.metadataErrors.fileName, "File name은 필수입니다.");
});

test("validateParameters allows the same local name in resource and data namespaces", () => {
  const resourceNode = makeResourceNode({
    id: "resource-vpc",
    parameters: {
      terraformBlockType: "resource",
      resourceType: "aws_vpc",
      resourceName: "main",
      fileName: "main",
      values: { cidrBlock: "10.0.0.0/16" }
    }
  });
  const dataParameters = {
    terraformBlockType: "data" as const,
    resourceType: "aws_vpc",
    resourceName: "main",
    fileName: "data",
    values: { cidrBlock: "10.0.0.0/16" }
  };

  const validation = validateParameters(
    dataParameters,
    [],
    [resourceNode],
    "data-vpc",
    makeCatalog()
  );

  assert.equal(validation.metadataErrors.resourceName, undefined);
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
