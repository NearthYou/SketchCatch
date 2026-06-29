import assert from "node:assert/strict";
import { test } from "node:test";
import type { ParameterCatalogDefinition } from "./catalog";
import {
  filterAdvancedDefinitions,
  getAdvancedDefinitions,
  getAdvancedPickerEmptyMessage
} from "./advanced-parameters";

test("getAdvancedDefinitions combines stored and newly added optional definitions", () => {
  const tagsDefinition = makeDefinition({ name: "tags", optional: true });
  const definitions = [
    makeDefinition({ name: "cidrBlock", required: true }),
    tagsDefinition,
    makeDefinition({ name: "enableDnsSupport", optional: true }),
    makeDefinition({ name: "arn", computed: true })
  ];
  const activeDefinitions = [tagsDefinition];

  assert.deepEqual(
    getAdvancedDefinitions(activeDefinitions, definitions, ["enableDnsSupport"]).map(
      (definition) => definition.name
    ),
    ["tags", "enableDnsSupport"]
  );
});

test("filterAdvancedDefinitions excludes already active definitions and searches schema text", () => {
  const tagsDefinition = makeDefinition({ name: "tags", optional: true, terraformName: "tags" });
  const definitions = [
    tagsDefinition,
    makeDefinition({
      name: "enableDnsSupport",
      optional: true,
      terraformName: "enable_dns_support",
      description: "Enable DNS resolution"
    }),
    makeDefinition({
      name: "instanceTenancy",
      optional: true,
      terraformName: "instance_tenancy"
    })
  ];

  assert.deepEqual(
    filterAdvancedDefinitions(definitions, [tagsDefinition], "dns").map(
      (definition) => definition.name
    ),
    ["enableDnsSupport"]
  );
});

test("getAdvancedPickerEmptyMessage explains why no optional choices are available", () => {
  const tagsDefinition = makeDefinition({ name: "tags", optional: true });
  const definitions = [
    tagsDefinition,
    makeDefinition({ name: "enableDnsSupport", optional: true })
  ];

  assert.equal(
    getAdvancedPickerEmptyMessage([], [], ""),
    "이 리소스 타입에는 optional 파라미터가 없습니다."
  );
  assert.equal(getAdvancedPickerEmptyMessage(definitions, [], "zzz"), "검색 결과가 없습니다.");
  assert.equal(
    getAdvancedPickerEmptyMessage(definitions, definitions, ""),
    "모든 optional 파라미터가 추가되었습니다."
  );
  assert.equal(
    getAdvancedPickerEmptyMessage(definitions, [tagsDefinition], ""),
    "추가할 optional 파라미터가 없습니다."
  );
});

function makeDefinition({
  computed = false,
  description,
  name,
  optional = false,
  required = false,
  terraformName = name,
  type = "string"
}: Partial<
  Pick<
    ParameterCatalogDefinition,
    "computed" | "description" | "optional" | "required" | "terraformName" | "type"
  >
> &
  Pick<ParameterCatalogDefinition, "name">): ParameterCatalogDefinition {
  return {
    name,
    terraformName,
    label: name,
    type,
    required,
    optional,
    computed,
    sensitive: false,
    description,
    inputKind: "text"
  };
}
