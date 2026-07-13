import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { TerraformBlockType } from "./index.js";
import {
  getDefaultResourceDefinitionByResourceType,
  getResourceDefinitionById,
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "./resource-definitions.js";

const BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT = 87;
const brainboardCaptureDirectoryPath = fileURLToPath(
  new URL("../../../docs/gg/feat-infrastructure-template/brainboard-captures/", import.meta.url)
);

test("committed Brainboard captures have exactly one shared definition for all 87 Terraform identities", () => {
  const capturedIdentities = readCapturedTerraformIdentities();

  assert.equal(capturedIdentities.length, BRAINBOARD_CAPTURE_TERRAFORM_IDENTITY_COUNT);

  for (const { blockType, resourceType } of capturedIdentities) {
    const key = `${blockType}/${resourceType}`;
    const matches = resourceDefinitions.filter(
      (definition) =>
        definition.terraform.blockType === blockType &&
        definition.terraform.resourceType === resourceType
    );

    assert.equal(matches.length, 1, key);
    assert.equal(getResourceDefinitionById(matches[0]?.id ?? ""), matches[0], key);
    assert.equal(getResourceDefinitionByTerraform(blockType, resourceType), matches[0], key);
    assert.equal(matches[0]?.provider, "aws", key);
    assert.equal(matches[0]?.capabilities.terraformPreview, true, key);
    assert.equal(matches[0]?.capabilities.terraformSync, true, key);
  }
});

test("RDS_READ_REPLICA uses the authoritative aws_db_instance definition as its default alias", () => {
  const rdsInstance = getResourceDefinitionById("aws-rds-instance");
  const readReplicaDefault = getDefaultResourceDefinitionByResourceType("RDS_READ_REPLICA");

  assert.ok(rdsInstance);
  assert.equal(readReplicaDefault, rdsInstance);
  assert.deepEqual(readReplicaDefault.terraform, {
    blockType: "resource",
    resourceType: "aws_db_instance"
  });
  assert.equal(readReplicaDefault.resourceType, "RDS");
});

test("shared resource definition IDs and Terraform identities remain unique", () => {
  const ids = resourceDefinitions.map((definition) => definition.id);
  const terraformIdentities = resourceDefinitions.map(
    (definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  );

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(terraformIdentities).size, terraformIdentities.length);
});

test("classic AWS identities stay distinct from newer Terraform resources", () => {
  assertDistinctTerraformIdentities("aws-elb", "aws-lb");
  assertDistinctTerraformIdentities(
    "aws-cloudfront-origin-access-identity",
    "aws-cloudfront-origin-access-control"
  );
  assertDistinctTerraformIdentities("aws-s3-bucket-object", "aws-s3-object");
  assertDistinctTerraformIdentities("aws-waf-web-acl", "aws-wafv2-web-acl");

  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_rule")?.terraform.resourceType,
    "aws_waf_rule"
  );
  assert.equal(
    getResourceDefinitionByTerraform("resource", "aws_waf_ipset")?.terraform.resourceType,
    "aws_waf_ipset"
  );
});

function readCapturedTerraformIdentities(): Array<{
  readonly blockType: TerraformBlockType;
  readonly resourceType: string;
}> {
  const identityKeys = new Set<string>();

  for (const fileName of readdirSync(brainboardCaptureDirectoryPath).sort()) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const capture = JSON.parse(
      readFileSync(`${brainboardCaptureDirectoryPath}/${fileName}`, "utf8")
    ) as {
      readonly terraform?: {
        readonly resourceAddresses?: readonly string[] | undefined;
      } | null;
    };

    for (const address of capture.terraform?.resourceAddresses ?? []) {
      identityKeys.add(createTerraformIdentityKeyFromAddress(address));
    }
  }

  return [...identityKeys].sort().map((key) => {
    const separatorIndex = key.indexOf("/");
    const blockType = key.slice(0, separatorIndex);

    assert.ok(blockType === "data" || blockType === "resource", key);

    return {
      blockType,
      resourceType: key.slice(separatorIndex + 1)
    };
  });
}

function createTerraformIdentityKeyFromAddress(address: string): string {
  const segments = address.split(".");

  if (segments[0] === "data") {
    assert.ok(segments[1], `Invalid Terraform data address: ${address}`);
    return `data/${segments[1]}`;
  }

  assert.ok(segments[0], `Invalid Terraform resource address: ${address}`);
  return `resource/${segments[0]}`;
}

function assertDistinctTerraformIdentities(firstId: string, secondId: string): void {
  const first = getResourceDefinitionById(firstId);
  const second = getResourceDefinitionById(secondId);

  assert.ok(first, firstId);
  assert.ok(second, secondId);
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(first.terraform, second.terraform);
}
