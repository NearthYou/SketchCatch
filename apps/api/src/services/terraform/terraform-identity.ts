import type { TerraformBlockIdentity } from "@sketchcatch/types";

export function createTerraformBlockAddress(identity: TerraformBlockIdentity): string {
  const prefix = identity.terraformBlockType === "data" ? "data." : "";

  return `${prefix}${identity.resourceType}.${identity.resourceName}`;
}

export function createTerraformBlockIdentityKey(identity: TerraformBlockIdentity): string {
  return `${identity.terraformBlockType}/${identity.resourceType}/${identity.resourceName}`;
}
