import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResourceItem } from "@sketchcatch/types";
import { createTerraformResourceValidationCandidates } from "./terraform-resource-validation-audit.js";

test("resource validation candidates include every provider-backed palette resource", () => {
  const catalog: ResourceItem[] = [
    createCatalogItem("design-user-client", "sketchcatch_user_client"),
    createCatalogItem("aws-caller-identity", "aws_caller_identity"),
    createCatalogItem("aws-s3-bucket", "aws_s3_bucket"),
    createCatalogItem("kubernetes-deployment", "kubernetes_deployment")
  ];

  assert.deepEqual(createTerraformResourceValidationCandidates(catalog), [
    {
      definitionId: "aws-caller-identity",
      enabled: true,
      label: "aws_caller_identity",
      name: "aws-caller-identity",
      provider: "aws",
      terraformBlockType: "data",
      terraformResourceType: "aws_caller_identity"
    },
    {
      definitionId: "aws-s3-bucket",
      enabled: true,
      label: "aws_s3_bucket",
      name: "aws-s3-bucket",
      provider: "aws",
      terraformBlockType: "resource",
      terraformResourceType: "aws_s3_bucket"
    },
    {
      definitionId: "kubernetes-deployment",
      enabled: true,
      label: "kubernetes_deployment",
      name: "kubernetes-deployment",
      provider: "kubernetes",
      terraformBlockType: "resource",
      terraformResourceType: "kubernetes_deployment"
    }
  ]);
});

function createCatalogItem(id: string, type: string): ResourceItem {
  return {
    id,
    name: id,
    cloudProvider: id.startsWith("kubernetes-") ? "kubernetes" : "aws",
    area: "other",
    iconUrl: "/test.svg",
    enabled: true,
    nodeDefaults: {
      type,
      label: type,
      size: { width: 48, height: 48 }
    }
  };
}
