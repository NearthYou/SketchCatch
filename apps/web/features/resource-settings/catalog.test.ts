import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getResourceDefinitionByTerraform,
  resourceDefinitions
} from "@sketchcatch/types/resource-definitions";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { resourceCatalog } from "./catalog";

const terraformDefinitionKeys = new Set(
  resourceDefinitions.map(
    (definition) => `${definition.terraform.blockType}/${definition.terraform.resourceType}`
  )
);

test("resourceCatalog sizes area defaults below the Region hierarchy root", () => {
  assert.deepEqual(getResourceSize("design_region"), { width: 260, height: 180 });
  assert.deepEqual(getResourceSize("aws_vpc"), { width: 240, height: 160 });
  assert.deepEqual(getResourceSize("design_az"), { width: 220, height: 150 });
  assert.deepEqual(getResourceSize("design_group"), { width: 200, height: 130 });
  assert.deepEqual(getResourceSize("aws_subnet"), { width: 180, height: 120 });
  assert.deepEqual(getResourceSize("aws_security_group"), { width: 180, height: 120 });
});

test("resourceCatalog keeps regular network resources at icon node size", () => {
  assert.deepEqual(getResourceSize("aws_internet_gateway"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_route_table_association"), { width: 124, height: 96 });
  assert.deepEqual(getResourceSize("aws_cloudfront_distribution"), { width: 124, height: 96 });
});

test("resourceCatalog provides a CloudFront icon for converted drafts and Terraform proposals", () => {
  const resource = resourceCatalog.find(
    (item) => item.nodeDefaults.type === "aws_cloudfront_distribution"
  );

  assert.equal(
    resource?.iconUrl,
    "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg"
  );
});

test("resourceCatalog Terraform entries use shared resource definitions", () => {
  for (const resource of getTerraformCatalogItems()) {
    const terraformBlockType = resource.nodeDefaults.terraformBlockType ?? "resource";
    const definition = getResourceDefinitionByTerraform(terraformBlockType, resource.nodeDefaults.type);

    assert.ok(
      definition,
      `Missing shared definition for ${terraformBlockType}/${resource.nodeDefaults.type}`
    );
    assert.equal(resource.id, definition.id);
    assert.equal(resource.cloudProvider, definition.provider);
  }
});

test("resourceCatalog displays every shared Terraform resource definition", () => {
  const catalogKeys = new Set(
    getTerraformCatalogItems().map(
      (resource) => `${resource.nodeDefaults.terraformBlockType ?? "resource"}/${resource.nodeDefaults.type}`
    )
  );

  for (const definition of resourceDefinitions) {
    const key = `${definition.terraform.blockType}/${definition.terraform.resourceType}`;

    assert.ok(catalogKeys.has(key), `Missing catalog presentation for ${key}`);
  }
});

test("resource parameter panel capability matches the parameter catalog", () => {
  const parameterCatalogResourceTypes = Object.keys(terraformParameterCatalog.resources).sort();
  const capabilityResourceTypes = resourceDefinitions
    .filter((definition) => definition.capabilities.parameterPanel)
    .map((definition) => definition.terraform.resourceType)
    .sort();

  assert.deepEqual(capabilityResourceTypes, parameterCatalogResourceTypes);
});

function getResourceSize(resourceType: string) {
  const resource = resourceCatalog.find((item) => item.nodeDefaults.type === resourceType);

  assert.ok(resource, `Missing catalog resource: ${resourceType}`);

  return resource.nodeDefaults.size;
}

function getTerraformCatalogItems() {
  return resourceCatalog.filter((resource) => terraformDefinitionKeys.has(createCatalogResourceKey(resource)));
}

function createCatalogResourceKey(resource: (typeof resourceCatalog)[number]): string {
  return `${resource.nodeDefaults.terraformBlockType ?? "resource"}/${resource.nodeDefaults.type}`;
}
