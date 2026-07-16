import assert from "node:assert/strict";
import { test } from "node:test";
import { terraformAwsParameterCatalog } from "./catalog.ts";

test("single Terraform nested blocks use object fields in the parameter catalog", () => {
  const healthCheck = findDefinition("aws_elb", "healthCheck");
  const defaultAction = findDefinition("aws_waf_web_acl", "defaultAction");
  const replicationRule = findDefinition("aws_s3_bucket_replication_configuration", "rule");
  const destination = replicationRule.children?.find(({ name }) => name === "destination");

  assert.equal(healthCheck.type, "object");
  assert.equal(healthCheck.inputKind, "nested-block");
  assert.equal(healthCheck.required, false);
  assert.equal(healthCheck.optional, true);
  assert.equal(defaultAction.type, "object");
  assert.equal(destination?.type, "object");
});

function findDefinition(resourceType: string, name: string) {
  const definition = terraformAwsParameterCatalog.resources[resourceType]?.find(
    (candidate) => candidate.name === name
  );

  assert.ok(definition, `${resourceType}.${name} parameter definition is missing`);
  return definition;
}
