import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerraformBlockAddress, createTerraformBlockIdentityKey } from "./terraform-identity.js";

test("createTerraformBlockIdentityKey separates resource and data blocks", () => {
  assert.notEqual(
    createTerraformBlockIdentityKey({
      terraformBlockType: "resource",
      resourceType: "aws_ami",
      resourceName: "ubuntu"
    }),
    createTerraformBlockIdentityKey({
      terraformBlockType: "data",
      resourceType: "aws_ami",
      resourceName: "ubuntu"
    })
  );
});

test("createTerraformBlockIdentityKey ignores source file names", () => {
  const identity = {
    terraformBlockType: "resource" as const,
    resourceType: "aws_vpc",
    resourceName: "main"
  };

  assert.equal(
    createTerraformBlockIdentityKey(identity),
    createTerraformBlockIdentityKey({
      terraformBlockType: "resource",
      resourceType: "aws_vpc",
      resourceName: "main"
    })
  );
});

test("createTerraformBlockAddress formats Terraform resource and data addresses", () => {
  assert.equal(
    createTerraformBlockAddress({
      terraformBlockType: "resource",
      resourceType: "aws_vpc",
      resourceName: "main"
    }),
    "aws_vpc.main"
  );
  assert.equal(
    createTerraformBlockAddress({
      terraformBlockType: "data",
      resourceType: "aws_ami",
      resourceName: "ubuntu"
    }),
    "data.aws_ami.ubuntu"
  );
});
