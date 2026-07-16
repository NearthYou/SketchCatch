import {
  RUNTIME_ADAPTER_KINDS,
  RUNTIME_CONVERGENCE_CONTRACT_VERSION,
  type JsonValue,
  type RuntimeAdapterKind,
  type RuntimeConvergenceFallbackReason,
  type RuntimeDeploymentTarget,
  type RuntimeTargetScope
} from "@sketchcatch/types";
import { createDeploymentTargetIdentity } from "./deployment-target-identity.js";

export type RuntimeArtifactRevision = {
  readonly artifactFingerprint: string;
  readonly digestAlgorithm: "sha256";
  readonly digest: string;
  readonly reference: string;
};

export type RuntimeProviderRevision = {
  readonly provider: "aws" | "kubernetes";
  readonly resourceType: string;
  readonly revisionId: string;
  readonly artifactReference: string | null;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
};

export type RuntimeHealthObservation = {
  readonly status: "healthy" | "unhealthy" | "unknown";
  readonly verifiedAt: string | null;
};

export type RuntimeRollbackEvidence = Readonly<
  Record<string, string | number | boolean | null>
>;

export type RuntimeProviderCurrentState = {
  readonly adapterKind: RuntimeAdapterKind;
  readonly deploymentTargetFingerprint: string;
  readonly scope: RuntimeTargetScope;
  readonly target: RuntimeDeploymentTarget;
  readonly artifact: RuntimeArtifactRevision;
  readonly providerRevision: RuntimeProviderRevision;
  readonly health: RuntimeHealthObservation;
  readonly healthEvidence: JsonValue;
  readonly rollbackEvidence: RuntimeRollbackEvidence | null;
};

export type RuntimeProviderGateway = {
  readCurrentState(input: {
    readonly scope: RuntimeTargetScope;
    readonly target: RuntimeDeploymentTarget;
  }): Promise<RuntimeProviderCurrentState>;
  rollout(input: {
    readonly scope: RuntimeTargetScope;
    readonly target: RuntimeDeploymentTarget;
    readonly deploymentTargetFingerprint: string;
    readonly artifact: RuntimeArtifactRevision;
  }): Promise<RuntimeProviderCurrentState>;
};

export type RuntimeConvergenceAdapter = {
  readonly kind: RuntimeAdapterKind;
  readCurrentState(input: {
    readonly scope: RuntimeTargetScope;
    readonly target: RuntimeDeploymentTarget;
  }): Promise<RuntimeProviderCurrentState>;
  compareDesiredTarget(input: {
    readonly current: RuntimeProviderCurrentState;
    readonly desiredTargetFingerprint: string;
  }): boolean;
  verifyArtifactDigest(input: {
    readonly current: RuntimeProviderCurrentState;
    readonly desiredArtifact: RuntimeArtifactRevision;
  }): boolean;
  rollout(input: {
    readonly scope: RuntimeTargetScope;
    readonly target: RuntimeDeploymentTarget;
    readonly deploymentTargetFingerprint: string;
    readonly artifact: RuntimeArtifactRevision;
  }): Promise<RuntimeProviderCurrentState>;
  checkHealth(current: RuntimeProviderCurrentState): RuntimeConvergenceFallbackReason | null;
  captureRollbackEvidence(
    current: RuntimeProviderCurrentState
  ): RuntimeRollbackEvidence | null;
};

export type RuntimeConvergenceAdapterRegistry = {
  kinds(): readonly RuntimeAdapterKind[];
  get(kind: RuntimeAdapterKind): RuntimeConvergenceAdapter;
};

export type RuntimeConvergenceResult = {
  readonly contractVersion: typeof RUNTIME_CONVERGENCE_CONTRACT_VERSION;
  readonly adapterKind: RuntimeAdapterKind;
  readonly outcome: "already_active" | "rolled_out";
  readonly fallbackReason: RuntimeConvergenceFallbackReason | null;
  readonly deploymentTargetFingerprint: string;
  readonly artifactFingerprint: string;
  readonly artifactDigestAlgorithm: "sha256";
  readonly artifactDigest: string;
  readonly providerStateVerifiedAt: string;
  readonly providerRevision: RuntimeProviderRevision;
  readonly health: RuntimeHealthObservation;
  readonly healthEvidence: JsonValue;
  readonly rollbackEvidence: RuntimeRollbackEvidence | null;
};

type RuntimeConvergenceVerificationFailureReason =
  | RuntimeConvergenceFallbackReason
  | "rollout_failed"
  | "provider_revision_unverified"
  | "evidence_unverified";

export class RuntimeConvergenceVerificationError extends Error {
  constructor(
    readonly reason: RuntimeConvergenceVerificationFailureReason,
    readonly rollbackEvidence: RuntimeRollbackEvidence | null
  ) {
    super(`Runtime convergence verification failed: ${reason}`);
    this.name = "RuntimeConvergenceVerificationError";
  }
}

export class RuntimeRolloutRolledBackError extends Error {
  constructor(readonly currentState: RuntimeProviderCurrentState) {
    super("Runtime rollout restored the previous provider revision");
    this.name = "RuntimeRolloutRolledBackError";
  }
}

export type RuntimeConvergenceService = {
  converge(input: {
    readonly scope: RuntimeTargetScope;
    readonly target: RuntimeDeploymentTarget;
    readonly artifact: RuntimeArtifactRevision;
  }): Promise<RuntimeConvergenceResult>;
};

export function createRuntimeConvergenceService(options: {
  readonly adapters: RuntimeConvergenceAdapterRegistry;
  readonly now?: (() => Date) | undefined;
}): RuntimeConvergenceService {
  const now = options.now ?? (() => new Date());

  return {
    async converge(input) {
      const identity = createDeploymentTargetIdentity({
        contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
        scope: input.scope,
        target: input.target
      });
      const adapter = options.adapters.get(identity.adapterKind);
      let current: RuntimeProviderCurrentState | null = null;
      let fallbackReason: RuntimeConvergenceFallbackReason | null = null;

      try {
        current = await adapter.readCurrentState({
          scope: identity.scope,
          target: identity.target
        });
      } catch {
        fallbackReason = "current_state_unavailable";
      }

      if (current) {
        fallbackReason = findMismatchReason(
          adapter,
          current,
          identity.deploymentTargetFingerprint,
          input.artifact
        );
        if (!fallbackReason) {
          return createResult({
            now,
            identity,
            artifact: input.artifact,
            current,
            outcome: "already_active",
            fallbackReason: null,
            rollbackEvidence: adapter.captureRollbackEvidence(current)
          });
        }
      }

      const rollbackEvidence = current
        ? adapter.captureRollbackEvidence(current)
        : null;
      let rolledOut: RuntimeProviderCurrentState;
      try {
        rolledOut = await adapter.rollout({
          scope: identity.scope,
          target: identity.target,
          deploymentTargetFingerprint: identity.deploymentTargetFingerprint,
          artifact: input.artifact
        });
      } catch (error) {
        if (error instanceof RuntimeRolloutRolledBackError) throw error;
        throw new RuntimeConvergenceVerificationError("rollout_failed", rollbackEvidence);
      }

      const postRolloutMismatch = findMismatchReason(
        adapter,
        rolledOut,
        identity.deploymentTargetFingerprint,
        input.artifact
      );
      if (postRolloutMismatch) {
        throw new RuntimeConvergenceVerificationError(postRolloutMismatch, rollbackEvidence);
      }

      return createResult({
        now,
        identity,
        artifact: input.artifact,
        current: rolledOut,
        outcome: "rolled_out",
        fallbackReason: fallbackReason ?? "current_state_unavailable",
        rollbackEvidence: rollbackEvidence ?? adapter.captureRollbackEvidence(rolledOut)
      });
    }
  };
}

export function createRuntimeConvergenceAdapterRegistry(
  gateways: Readonly<Record<RuntimeAdapterKind, RuntimeProviderGateway>>
): RuntimeConvergenceAdapterRegistry {
  const adapters = new Map<RuntimeAdapterKind, RuntimeConvergenceAdapter>([
    ["ecs_service_fargate", createEcsServiceFargateAdapter(gateways.ecs_service_fargate)],
    [
      "ecs_service_ec2_capacity_provider",
      createEcsServiceEc2CapacityProviderAdapter(gateways.ecs_service_ec2_capacity_provider)
    ],
    ["ec2_instance", createEc2InstanceAdapter(gateways.ec2_instance)],
    [
      "ec2_auto_scaling_group",
      createEc2AutoScalingGroupAdapter(gateways.ec2_auto_scaling_group)
    ],
    [
      "eks_managed_node_group",
      createEksManagedNodeGroupAdapter(gateways.eks_managed_node_group)
    ],
    [
      "eks_self_managed_node",
      createEksSelfManagedNodeAdapter(gateways.eks_self_managed_node)
    ],
    ["eks_fargate_profile", createEksFargateProfileAdapter(gateways.eks_fargate_profile)],
    [
      "kubernetes_deployment",
      createKubernetesDeploymentAdapter(gateways.kubernetes_deployment)
    ],
    ["lambda_alias", createLambdaAliasAdapter(gateways.lambda_alias)],
    [
      "static_s3_cloudfront",
      createStaticS3CloudFrontAdapter(gateways.static_s3_cloudfront)
    ]
  ]);

  return {
    kinds: () => RUNTIME_ADAPTER_KINDS,
    get(kind) {
      const adapter = adapters.get(kind);
      if (!adapter) throw new Error(`Unsupported runtime adapter: ${kind}`);
      return adapter;
    }
  };
}

export const createEcsServiceFargateAdapter = createAdapterFactory(
  "ecs_service_fargate"
);
export const createEcsServiceEc2CapacityProviderAdapter = createAdapterFactory(
  "ecs_service_ec2_capacity_provider"
);
export const createEc2InstanceAdapter = createAdapterFactory("ec2_instance");
export const createEc2AutoScalingGroupAdapter = createAdapterFactory(
  "ec2_auto_scaling_group"
);
export const createEksManagedNodeGroupAdapter = createAdapterFactory(
  "eks_managed_node_group"
);
export const createEksSelfManagedNodeAdapter = createAdapterFactory(
  "eks_self_managed_node"
);
export const createEksFargateProfileAdapter = createAdapterFactory("eks_fargate_profile");
export const createKubernetesDeploymentAdapter = createAdapterFactory(
  "kubernetes_deployment"
);
export const createLambdaAliasAdapter = createAdapterFactory("lambda_alias");
export const createStaticS3CloudFrontAdapter = createAdapterFactory(
  "static_s3_cloudfront"
);

function createAdapterFactory(
  kind: RuntimeAdapterKind
): (gateway: RuntimeProviderGateway) => RuntimeConvergenceAdapter {
  return (gateway) => ({
    kind,
    async readCurrentState(input) {
      assertTargetKind(input.target, kind);
      const current = await gateway.readCurrentState(input);
      assertCurrentStateKind(current, kind);
      return current;
    },
    compareDesiredTarget({ current, desiredTargetFingerprint }) {
      try {
        assertCurrentStateKind(current, kind);
        return (
          current.deploymentTargetFingerprint === desiredTargetFingerprint &&
          createDeploymentTargetIdentity({
            contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
            scope: current.scope,
            target: current.target
          }).deploymentTargetFingerprint === desiredTargetFingerprint
        );
      } catch {
        return false;
      }
    },
    verifyArtifactDigest({ current, desiredArtifact }) {
      return (
        current.artifact.digestAlgorithm === "sha256" &&
        current.artifact.digest === desiredArtifact.digest &&
        current.artifact.reference === desiredArtifact.reference
      );
    },
    async rollout(input) {
      assertTargetKind(input.target, kind);
      const current = await gateway.rollout(input);
      assertCurrentStateKind(current, kind);
      return current;
    },
    checkHealth(current) {
      if (current.health.status === "unhealthy") return "unhealthy";
      if (
        current.health.status !== "healthy" ||
        !current.health.verifiedAt ||
        Number.isNaN(Date.parse(current.health.verifiedAt))
      ) {
        return "health_unverified";
      }
      return null;
    },
    captureRollbackEvidence(current) {
      return current.rollbackEvidence;
    }
  });
}

function findMismatchReason(
  adapter: RuntimeConvergenceAdapter,
  current: RuntimeProviderCurrentState,
  deploymentTargetFingerprint: string,
  artifact: RuntimeArtifactRevision
): RuntimeConvergenceFallbackReason | null {
  if (!adapter.compareDesiredTarget({ current, desiredTargetFingerprint: deploymentTargetFingerprint })) {
    return "target_mismatch";
  }
  if (current.artifact.artifactFingerprint !== artifact.artifactFingerprint) {
    return "artifact_fingerprint_mismatch";
  }
  if (!adapter.verifyArtifactDigest({ current, desiredArtifact: artifact })) {
    return "artifact_digest_mismatch";
  }
  return adapter.checkHealth(current);
}

function createResult(input: {
  readonly now: () => Date;
  readonly identity: ReturnType<typeof createDeploymentTargetIdentity>;
  readonly artifact: RuntimeArtifactRevision;
  readonly current: RuntimeProviderCurrentState;
  readonly outcome: "already_active" | "rolled_out";
  readonly fallbackReason: RuntimeConvergenceFallbackReason | null;
  readonly rollbackEvidence: RuntimeRollbackEvidence | null;
}): RuntimeConvergenceResult {
  assertProviderRevision(input.current.providerRevision);
  assertEvidenceContainsNoSecretKeys(input.current.healthEvidence);
  assertEvidenceContainsNoSecretKeys(input.rollbackEvidence);
  return {
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    adapterKind: input.identity.adapterKind,
    outcome: input.outcome,
    fallbackReason: input.fallbackReason,
    deploymentTargetFingerprint: input.identity.deploymentTargetFingerprint,
    artifactFingerprint: input.artifact.artifactFingerprint,
    artifactDigestAlgorithm: "sha256",
    artifactDigest: input.artifact.digest,
    providerStateVerifiedAt: input.now().toISOString(),
    providerRevision: input.current.providerRevision,
    health: input.current.health,
    healthEvidence: input.current.healthEvidence,
    rollbackEvidence: input.rollbackEvidence
  };
}

function assertTargetKind(target: RuntimeDeploymentTarget, kind: RuntimeAdapterKind): void {
  if (target.adapterKind !== kind) {
    throw new Error("Runtime target does not match the provider adapter");
  }
}

function assertCurrentStateKind(
  current: RuntimeProviderCurrentState,
  kind: RuntimeAdapterKind
): void {
  if (
    current.adapterKind !== kind ||
    current.target.adapterKind !== kind ||
    current.providerRevision.provider !== current.scope.provider
  ) {
    throw new Error("Provider current state does not match the runtime adapter");
  }
}

function assertProviderRevision(revision: RuntimeProviderRevision): void {
  if (!revision.resourceType.trim() || !revision.revisionId.trim()) {
    throw new RuntimeConvergenceVerificationError("provider_revision_unverified", null);
  }
  for (const key of Object.keys(revision.metadata)) {
    const normalizedKey = key.replace(/[-_]+/gu, "");
    if (/(secret|token|password|credential|privatekey|accesskey|apikey)/iu.test(normalizedKey)) {
      throw new RuntimeConvergenceVerificationError("provider_revision_unverified", null);
    }
  }
}

function assertEvidenceContainsNoSecretKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertEvidenceContainsNoSecretKeys(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[-_]+/gu, "");
    if (/(secret|token|password|credential|privatekey|accesskey|apikey)/iu.test(normalizedKey)) {
      throw new RuntimeConvergenceVerificationError("evidence_unverified", null);
    }
    assertEvidenceContainsNoSecretKeys(nested);
  }
}
