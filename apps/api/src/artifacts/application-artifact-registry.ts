import type {
  ApplicationArtifact,
  ApplicationArtifactIdentity,
  ApplicationArtifactProviderLocation
} from "@sketchcatch/types";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const defaultLeaseDurationMs = 5 * 60 * 1_000;

export type ApplicationArtifactClaim = {
  readonly artifactId: string;
  readonly projectId: string;
  readonly sourceRepositoryId: string;
  readonly identity: ApplicationArtifactIdentity;
  readonly claimToken: string;
  readonly leaseExpiresAt: Date;
};

export type ApplicationArtifactExpectedLocation = Omit<
  ApplicationArtifactProviderLocation,
  "artifactReference" | "storageNamespace"
> & {
  readonly storageNamespace: string | null;
  readonly artifactReference?: string;
};

export type BuiltApplicationArtifact = {
  readonly digest: string;
  readonly location: ApplicationArtifactProviderLocation;
};

export type ApplicationArtifactProviderVerification =
  | {
      readonly outcome: "verified";
      readonly digest: string;
      readonly location: ApplicationArtifactProviderLocation;
    }
  | {
      readonly outcome: "miss";
      readonly reason:
        | "missing"
        | "digest_mismatch"
        | "account_mismatch"
        | "region_mismatch"
        | "ownership_mismatch"
        | "provider_error";
    };

export type ApplicationArtifactProviderVerifier = {
  verify(artifact: ApplicationArtifact): Promise<ApplicationArtifactProviderVerification>;
};

export type ApplicationArtifactRegistryRepository = {
  acquire(input: {
    readonly projectId: string;
    readonly sourceRepositoryId: string;
    readonly identity: ApplicationArtifactIdentity;
    readonly now: Date;
    readonly leaseDurationMs: number;
  }): Promise<
    | { readonly outcome: "available"; readonly artifact: ApplicationArtifact }
    | { readonly outcome: "claimed"; readonly claim: ApplicationArtifactClaim }
    | { readonly outcome: "busy"; readonly leaseExpiresAt: Date }
  >;
  invalidate(input: {
    readonly projectId: string;
    readonly artifactId: string;
    readonly reason: string;
    readonly invalidatedAt: Date;
  }): Promise<void>;
  renew(input: {
    readonly claim: ApplicationArtifactClaim;
    readonly renewedAt: Date;
    readonly leaseDurationMs: number;
  }): Promise<ApplicationArtifactClaim>;
  complete(input: {
    readonly claim: ApplicationArtifactClaim;
    readonly built: BuiltApplicationArtifact;
    readonly completedAt: Date;
  }): Promise<ApplicationArtifact>;
  fail(input: {
    readonly claim: ApplicationArtifactClaim;
    readonly reason: string;
    readonly failedAt: Date;
  }): Promise<void>;
  recordVerified(input: {
    readonly artifact: ApplicationArtifact;
    readonly verifiedAt: Date;
  }): Promise<ApplicationArtifact>;
};

export type ResolveApplicationArtifactInput = {
  readonly projectId: string;
  readonly sourceRepositoryId: string;
  readonly identity: ApplicationArtifactIdentity;
  readonly expectedLocation: ApplicationArtifactExpectedLocation;
  readonly now?: Date;
  readonly leaseDurationMs?: number;
  readonly repository: ApplicationArtifactRegistryRepository;
  readonly verifier: ApplicationArtifactProviderVerifier;
  readonly build: (claim: ApplicationArtifactClaim) => Promise<BuiltApplicationArtifact>;
};

export type ResolveApplicationArtifactResult = {
  readonly outcome: "reused" | "built";
  readonly artifact: ApplicationArtifact;
};

export class ApplicationArtifactBuildInProgressError extends Error {
  constructor(readonly leaseExpiresAt: Date) {
    super(`Application artifact build is already claimed until ${leaseExpiresAt.toISOString()}`);
    this.name = "ApplicationArtifactBuildInProgressError";
  }
}

export class ApplicationArtifactIsolationError extends Error {
  constructor(message = "Application artifact project isolation check failed") {
    super(message);
    this.name = "ApplicationArtifactIsolationError";
  }
}

export class ApplicationArtifactProviderVerificationError extends Error {
  constructor(message = "Application artifact provider verification failed") {
    super(message);
    this.name = "ApplicationArtifactProviderVerificationError";
  }
}

export async function resolveApplicationArtifact(
  input: ResolveApplicationArtifactInput
): Promise<ResolveApplicationArtifactResult> {
  const now = input.now ?? new Date();
  const leaseDurationMs = input.leaseDurationMs ?? defaultLeaseDurationMs;
  assertResolutionBoundary(input, leaseDurationMs);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const acquired = await input.repository.acquire({
      projectId: input.projectId,
      sourceRepositoryId: input.sourceRepositoryId,
      identity: input.identity,
      now,
      leaseDurationMs
    });

    if (acquired.outcome === "busy") {
      throw new ApplicationArtifactBuildInProgressError(acquired.leaseExpiresAt);
    }

    if (acquired.outcome === "available") {
      const artifact = acquired.artifact;
      assertArtifactProjectBoundary(artifact, input);
      if (!sameIdentity(artifact, input.identity)) {
        await input.repository.invalidate({
          projectId: input.projectId,
          artifactId: artifact.id,
          reason: "identity_mismatch",
          invalidatedAt: now
        });
        continue;
      }
      if (!isReusableArtifact(artifact)) {
        await input.repository.invalidate({
          projectId: input.projectId,
          artifactId: artifact.id,
          reason: "registry_metadata_invalid",
          invalidatedAt: now
        });
        continue;
      }
      const verification = await safelyVerify(input.verifier, artifact);

      if (isExactProviderMatch(artifact, input.expectedLocation, verification)) {
        const recorded = await input.repository.recordVerified({ artifact, verifiedAt: now });
        assertArtifactProjectBoundary(recorded, input);
        if (!matchesPersistedArtifact(recorded, input.identity, artifact)) {
          await input.repository.invalidate({
            projectId: input.projectId,
            artifactId: artifact.id,
            reason: "persistence_mismatch",
            invalidatedAt: now
          });
          continue;
        }
        return {
          outcome: "reused",
          artifact: recorded
        };
      }

      await input.repository.invalidate({
        projectId: input.projectId,
        artifactId: artifact.id,
        reason: verification.outcome === "miss" ? verification.reason : "provider_mismatch",
        invalidatedAt: now
      });
      continue;
    }

    return buildClaimedArtifact(input, acquired.claim, now);
  }

  throw new Error("Application artifact registry did not converge after cache invalidation");
}

async function buildClaimedArtifact(
  input: ResolveApplicationArtifactInput,
  claim: ApplicationArtifactClaim,
  now: Date
): Promise<ResolveApplicationArtifactResult> {
  assertClaimBoundary(claim, input);
  let completed = false;
  const heartbeat = startClaimLeaseHeartbeat(
    input.repository,
    claim,
    input.leaseDurationMs ?? defaultLeaseDurationMs
  );

  try {
    const built = await input.build(claim);
    assertBuiltArtifact(built, input.expectedLocation);
    const provisional = createProvisionalArtifact(claim, built, now);
    const verification = await safelyVerify(input.verifier, provisional);

    if (!isExactProviderMatch(provisional, input.expectedLocation, verification)) {
      throw new ApplicationArtifactProviderVerificationError(
        "New application artifact provider verification failed"
      );
    }

    await heartbeat.stop();
    const artifact = await input.repository.complete({ claim, built, completedAt: now });
    completed = true;
    assertArtifactProjectBoundary(artifact, input);
    if (
      !matchesPersistedArtifact(artifact, input.identity, {
        id: claim.artifactId,
        digest: built.digest,
        location: built.location
      })
    ) {
      await input.repository.invalidate({
        projectId: input.projectId,
        artifactId: claim.artifactId,
        reason: "persistence_mismatch",
        invalidatedAt: now
      });
      throw new ApplicationArtifactIsolationError(
        "Application artifact persistence changed verified artifact evidence"
      );
    }
    return { outcome: "built", artifact };
  } catch (error) {
    await heartbeat.stop({ suppressError: true });
    if (!completed) {
      await input.repository.fail({
        claim,
        reason: toSafeFailureReason(error),
        failedAt: now
      });
    }
    throw error;
  } finally {
    await heartbeat.stop({ suppressError: true });
  }
}

function startClaimLeaseHeartbeat(
  repository: ApplicationArtifactRegistryRepository,
  claim: ApplicationArtifactClaim,
  leaseDurationMs: number
): {
  stop(options?: { readonly suppressError?: boolean }): Promise<void>;
} {
  const intervalMs = Math.max(10, Math.min(60_000, Math.floor(leaseDurationMs / 3)));
  let stopped = false;
  let renewal: Promise<void> | null = null;
  let renewalError: unknown;
  const timer = setInterval(() => {
    if (stopped || renewal || renewalError) return;
    renewal = repository
      .renew({ claim, renewedAt: new Date(), leaseDurationMs })
      .then(() => undefined)
      .catch((error: unknown) => {
        renewalError = error;
      })
      .finally(() => {
        renewal = null;
      });
  }, intervalMs);
  timer.unref?.();

  return {
    async stop(options = {}) {
      if (!stopped) {
        stopped = true;
        clearInterval(timer);
      }
      await renewal;
      if (!options.suppressError && renewalError) throw renewalError;
    }
  };
}

async function safelyVerify(
  verifier: ApplicationArtifactProviderVerifier,
  artifact: ApplicationArtifact
): Promise<ApplicationArtifactProviderVerification> {
  try {
    return await verifier.verify(artifact);
  } catch {
    return { outcome: "miss", reason: "provider_error" };
  }
}

function isExactProviderMatch(
  artifact: ApplicationArtifact,
  expected: ApplicationArtifactExpectedLocation,
  verification: ApplicationArtifactProviderVerification
): boolean {
  if (verification.outcome !== "verified") return false;

  return (
    verification.digest === artifact.digest &&
    sameLocation(verification.location, artifact.location) &&
    artifact.location.provider === expected.provider &&
    artifact.location.accountId === expected.accountId &&
    artifact.location.region === expected.region &&
    (expected.storageNamespace === null ||
      artifact.location.storageNamespace === expected.storageNamespace) &&
    (expected.artifactReference === undefined ||
      artifact.location.artifactReference === expected.artifactReference) &&
    artifact.location.ownershipScope === expected.ownershipScope
  );
}

function sameLocation(
  left: ApplicationArtifactProviderLocation,
  right: ApplicationArtifactProviderLocation
): boolean {
  return (
    left.provider === right.provider &&
    left.accountId === right.accountId &&
    left.region === right.region &&
    left.storageNamespace === right.storageNamespace &&
    left.artifactReference === right.artifactReference &&
    left.ownershipScope === right.ownershipScope
  );
}

function assertResolutionBoundary(
  input: ResolveApplicationArtifactInput,
  leaseDurationMs: number
): void {
  if (!input.projectId.trim() || !input.sourceRepositoryId.trim()) {
    throw new ApplicationArtifactIsolationError("Application artifact scope must be explicit");
  }
  if (input.expectedLocation.ownershipScope !== `project:${input.projectId}`) {
    throw new ApplicationArtifactIsolationError("Application artifact ownership must match its project");
  }
  if (
    input.expectedLocation.artifactReference !== undefined &&
    !input.expectedLocation.artifactReference.trim()
  ) {
    throw new Error("Expected application artifact reference must be non-empty");
  }
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 30) {
    throw new Error("Application artifact lease duration must be at least 30 milliseconds");
  }
}

function assertClaimBoundary(
  claim: ApplicationArtifactClaim,
  input: ResolveApplicationArtifactInput
): void {
  if (
    claim.projectId !== input.projectId ||
    claim.sourceRepositoryId !== input.sourceRepositoryId ||
    !sameIdentity(claim.identity, input.identity) ||
    !claim.claimToken.trim()
  ) {
    throw new ApplicationArtifactIsolationError("Application artifact claim scope is invalid");
  }
}

function assertArtifactProjectBoundary(
  artifact: ApplicationArtifact,
  input: ResolveApplicationArtifactInput
): void {
  if (artifact.projectId !== input.projectId) {
    throw new ApplicationArtifactIsolationError();
  }
}

function isReusableArtifact(artifact: ApplicationArtifact): boolean {
  return artifact.status === "available" && sha256Pattern.test(artifact.digest);
}

function sameIdentity(
  left: ApplicationArtifactIdentity,
  right: ApplicationArtifactIdentity
): boolean {
  return (
    left.artifactFingerprint === right.artifactFingerprint &&
    left.repositoryIdentity === right.repositoryIdentity &&
    left.commitSha === right.commitSha &&
    left.kind === right.kind &&
    left.buildConfigSha256 === right.buildConfigSha256 &&
    left.buildContractVersion === right.buildContractVersion &&
    left.targetOs === right.targetOs &&
    left.targetArchitecture === right.targetArchitecture &&
    left.buildInputIdentitySha256 === right.buildInputIdentitySha256
  );
}

function matchesPersistedArtifact(
  artifact: ApplicationArtifact,
  identity: ApplicationArtifactIdentity,
  expected: {
    readonly id: string;
    readonly digest: string;
    readonly location: ApplicationArtifactProviderLocation;
  }
): boolean {
  return (
    artifact.id === expected.id &&
    sameIdentity(artifact, identity) &&
    isReusableArtifact(artifact) &&
    artifact.digest === expected.digest &&
    sameLocation(artifact.location, expected.location)
  );
}

function assertBuiltArtifact(
  built: BuiltApplicationArtifact,
  expected: ApplicationArtifactExpectedLocation
): void {
  if (!sha256Pattern.test(built.digest)) {
    throw new Error("Application artifact digest must be a lowercase sha256 value");
  }
  if (
    built.location.provider !== expected.provider ||
    built.location.accountId !== expected.accountId ||
    built.location.region !== expected.region ||
    (expected.storageNamespace !== null &&
      built.location.storageNamespace !== expected.storageNamespace) ||
    (expected.artifactReference !== undefined &&
      built.location.artifactReference !== expected.artifactReference) ||
    built.location.ownershipScope !== expected.ownershipScope ||
    !built.location.artifactReference.trim()
  ) {
    throw new Error("Application artifact provider location does not match the approved target");
  }
}

function createProvisionalArtifact(
  claim: ApplicationArtifactClaim,
  built: BuiltApplicationArtifact,
  now: Date
): ApplicationArtifact {
  return {
    id: claim.artifactId,
    projectId: claim.projectId,
    sourceRepositoryId: claim.sourceRepositoryId,
    ...claim.identity,
    digestAlgorithm: "sha256",
    digest: built.digest,
    location: built.location,
    status: "available",
    verifiedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function toSafeFailureReason(error: unknown): string {
  if (error instanceof ApplicationArtifactProviderVerificationError) {
    return "provider_verification_failed";
  }
  if (error instanceof ApplicationArtifactIsolationError) return "scope_validation_failed";
  return "artifact_build_failed";
}
