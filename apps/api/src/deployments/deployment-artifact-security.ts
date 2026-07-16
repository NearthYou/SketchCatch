import { createHash } from "node:crypto";

export type DeploymentArtifactKind =
  | "tfplan"
  | "terraform-state"
  | "terraform-lock"
  | "plan-optimization";

export function assertDeploymentPlanArtifactObjectKey(input: {
  deploymentId: string;
  planArtifactId: string;
  objectKey: string;
}): void {
  const expectedObjectKey = `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`;

  assertExactDeploymentObjectKey(input.objectKey, expectedObjectKey);
}

export function assertDeploymentStateObjectKey(input: {
  deploymentId: string;
  objectKey: string;
}): void {
  const expectedObjectKey = `deployments/${input.deploymentId}/state/terraform.tfstate`;

  assertExactDeploymentObjectKey(input.objectKey, expectedObjectKey);
}

export function assertDeploymentTerraformLockFileObjectKey(input: {
  deploymentId: string;
  objectKey: string;
}): void {
  const expectedObjectKey = `deployments/${input.deploymentId}/terraform/.terraform.lock.hcl`;

  assertExactDeploymentObjectKey(input.objectKey, expectedObjectKey);
}

export function createDeploymentArtifactMetadata(input: {
  deploymentId: string;
  kind: DeploymentArtifactKind;
  sha256?: string;
}): Record<string, string> {
  return {
    "sketchcatch-deployment-id": input.deploymentId,
    "sketchcatch-artifact-kind": input.kind,
    ...(input.sha256 ? { "sketchcatch-sha256": input.sha256 } : {})
  };
}

export function createDeploymentArtifactTagging(kind: DeploymentArtifactKind): string {
  const tags = new URLSearchParams({
    "sketchcatch-artifact": kind,
    "sketchcatch-lifecycle": "deployment-artifact"
  });

  return tags.toString();
}

export function createS3ChecksumSha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("base64");
}

function assertExactDeploymentObjectKey(objectKey: string, expectedObjectKey: string): void {
  if (objectKey !== expectedObjectKey) {
    throw new Error("Deployment artifact object key does not match deployment scope");
  }

  if (objectKey.startsWith("/") || objectKey.includes("..") || objectKey.includes("\\")) {
    throw new Error("Deployment artifact object key is invalid");
  }
}
