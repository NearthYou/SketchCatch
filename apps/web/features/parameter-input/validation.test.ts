import assert from "node:assert/strict";
import { test } from "node:test";
import type { ParameterCatalogDefinition } from "./catalog";
import {
  getActiveOptionalDefinitions,
  getOptionalDefinitions,
  getRequiredDefinitions,
  getValidationDefinitions
} from "./validation";

test("getRequiredDefinitions returns only provider-required parameters", () => {
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    makeDefinition({ name: "tags", optional: true }),
    makeDefinition({ name: "arn", computed: true })
  ];

  assert.deepEqual(
    getRequiredDefinitions(definitions).map((definition) => definition.name),
    ["cidrBlock"]
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

function makeDefinition({
  computed = false,
  name,
  optional = false,
  required = false,
  type = "string"
}: Partial<Pick<ParameterCatalogDefinition, "computed" | "optional" | "required" | "type">> &
  Pick<ParameterCatalogDefinition, "name">): ParameterCatalogDefinition {
  return {
    name,
    terraformName: name,
    label: name,
    type,
    required,
    optional,
    computed,
    sensitive: false,
    inputKind: "text"
  };
}
