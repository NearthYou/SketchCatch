import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  normalizeLegacyRuntimeDeploymentTarget,
  RUNTIME_CONVERGENCE_CONTRACT_VERSION,
  type DeploymentTargetFingerprintInput,
  type DeploymentTargetIdentity,
  type ProjectDeploymentRuntimeConfig,
  type RuntimeDeploymentTarget
} from "@sketchcatch/types";
import { deploymentTargetFingerprintInputSchema } from "./runtime-convergence-schemas.js";

export function createDeploymentTargetIdentity(
  input: DeploymentTargetFingerprintInput
): DeploymentTargetIdentity {
  const parsed = deploymentTargetFingerprintInputSchema.parse(input);
  assertProviderAdapterBoundary(parsed.scope.provider, parsed.target);
  const scope = {
    projectId: parsed.scope.projectId.toLowerCase(),
    provider: parsed.scope.provider,
    accountId: parsed.scope.accountId,
    region: parsed.scope.region.toLowerCase()
  };
  const target = normalizeSetLikeTargetValues(parsed.target);
  const identityWithoutFingerprint = {
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    adapterKind: target.adapterKind,
    scope,
    target
  };

  return {
    deploymentTargetFingerprint: hashCanonicalValue(identityWithoutFingerprint),
    ...identityWithoutFingerprint
  };
}

export class DeploymentTargetFingerprintMismatchError extends Error {
  constructor() {
    super("Persisted deployment target fingerprint does not match the canonical runtime target");
    this.name = "DeploymentTargetFingerprintMismatchError";
  }
}

export function resolveAwsDeploymentTargetIdentity(input: {
  readonly projectId: string;
  readonly accountId: string;
  readonly region: string;
  readonly runtimeTarget?: RuntimeDeploymentTarget | null | undefined;
  readonly runtimeConfig: ProjectDeploymentRuntimeConfig;
  readonly healthCheckPath?: string | null | undefined;
  readonly persistedDeploymentTargetFingerprint?: string | null | undefined;
}): DeploymentTargetIdentity {
  const legacyTarget = normalizeLegacyRuntimeDeploymentTarget(input.runtimeConfig, {
    healthCheckPath: input.healthCheckPath
  });
  if (
    input.runtimeTarget &&
    !isDeepStrictEqual(
      normalizeSetLikeTargetValues(input.runtimeTarget),
      normalizeSetLikeTargetValues(legacyTarget)
    )
  ) {
    throw new DeploymentTargetFingerprintMismatchError();
  }
  const identity = createDeploymentTargetIdentity({
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: input.projectId,
      provider: "aws",
      accountId: input.accountId,
      region: input.region
    },
    target: input.runtimeTarget ?? legacyTarget
  });
  if (
    input.persistedDeploymentTargetFingerprint &&
    input.persistedDeploymentTargetFingerprint !== identity.deploymentTargetFingerprint
  ) {
    throw new DeploymentTargetFingerprintMismatchError();
  }
  return identity;
}

function normalizeSetLikeTargetValues(target: RuntimeDeploymentTarget): RuntimeDeploymentTarget {
  if (target.adapterKind === "ecs_service_ec2_capacity_provider") {
    return {
      ...target,
      capacity: {
        ...target.capacity,
        capacityProviderNames: [...new Set(target.capacity.capacityProviderNames)].sort()
      }
    };
  }
  if (target.adapterKind === "static_s3_cloudfront") {
    return {
      ...target,
      rollout: {
        ...target.rollout,
        invalidationPaths: [...new Set(target.rollout.invalidationPaths)].sort()
      }
    };
  }
  return target;
}

function hashCanonicalValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(toCanonicalJsonValue(value)) ?? "")
    .digest("hex");
}

function toCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCanonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, toCanonicalJsonValue(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertProviderAdapterBoundary(
  provider: DeploymentTargetFingerprintInput["scope"]["provider"],
  target: RuntimeDeploymentTarget
): void {
  const expectedProvider = target.adapterKind === "kubernetes_deployment"
    ? "kubernetes"
    : "aws";
  if (provider !== expectedProvider) {
    throw new Error("Runtime target adapter does not belong to the selected provider boundary");
  }
}
