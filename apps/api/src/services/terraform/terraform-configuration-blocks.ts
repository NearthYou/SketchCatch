const SILENTLY_PRESERVED_TERRAFORM_BLOCK_TYPES = new Set([
  "locals",
  "output",
  "variable"
]);

export function isSilentlyPreservedTerraformBlockType(
  blockType: string | undefined
): boolean {
  return blockType !== undefined && SILENTLY_PRESERVED_TERRAFORM_BLOCK_TYPES.has(blockType);
}
