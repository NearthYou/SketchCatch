import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { resourceCatalog } from "./catalog";

const publicDirectoryPath = fileURLToPath(new URL("../../public", import.meta.url));
const awsCatalogResources = resourceCatalog.filter(
  (item) => item.cloudProvider === "aws" && !item.id.startsWith("design-")
);
const coreAwsResourceTypes = [
  "aws_vpc",
  "aws_subnet",
  "aws_instance",
  "aws_db_instance",
  "aws_s3_bucket",
  "aws_security_group",
  "aws_internet_gateway",
  "aws_route_table",
  "aws_lb",
  "aws_autoscaling_group",
  "aws_lambda_function",
  "aws_cloudfront_distribution"
] as const;

test("resource settings catalog keeps a unique item identity for every AWS resource", () => {
  const catalogKeys = awsCatalogResources.map((item) => item.id);

  assert.ok(catalogKeys.length > 0);
  assert.equal(new Set(catalogKeys).size, catalogKeys.length);
});

test("every AWS resource catalog item uses an existing public icon asset", () => {
  for (const catalogItem of awsCatalogResources) {
    assert.ok(catalogItem.iconUrl, `${catalogItem.name} should have a defined iconUrl`);
    assert.equal(
      existsSync(`${publicDirectoryPath}${catalogItem.iconUrl}`),
      true,
      `${catalogItem.name} icon asset should exist at ${catalogItem.iconUrl}`
    );
  }
});

test("parameter catalog exposes fields for every core AWS resource", () => {
  for (const resourceType of coreAwsResourceTypes) {
    assert.ok(
      terraformParameterCatalog.resources[resourceType],
      `Missing parameter catalog resource ${resourceType}`
    );
  }
});
