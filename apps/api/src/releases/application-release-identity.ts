import { createHash } from "node:crypto";
import type { ApplicationReleaseProviderRevision } from "@sketchcatch/types";

const commitShaPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
const exactSemVerTagPattern = /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const manifestVersionPattern = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;

export type ApplicationReleaseVersionEvidence = {
  exactSemVerTag?: string | null | undefined;
  manifestVersion?: string | null | undefined;
  commitSha: string;
};

export type ProviderRevisionVerification = {
  matches: boolean;
  expectedFingerprint: string;
  observedFingerprint: string;
};

export function resolveApplicationReleaseVersion(
  evidence: ApplicationReleaseVersionEvidence
): string {
  if (!commitShaPattern.test(evidence.commitSha)) {
    throw new Error("A canonical 40 or 64 character commit SHA is required.");
  }
  if (evidence.exactSemVerTag !== null && evidence.exactSemVerTag !== undefined) {
    if (!exactSemVerTagPattern.test(evidence.exactSemVerTag)) {
      throw new Error("The exact release tag must be SemVer.");
    }
    return evidence.exactSemVerTag;
  }
  if (evidence.manifestVersion !== null && evidence.manifestVersion !== undefined) {
    if (!manifestVersionPattern.test(evidence.manifestVersion)) {
      throw new Error("The manifest version is not a safe release identifier.");
    }
    return evidence.manifestVersion;
  }
  return `sha-${evidence.commitSha.toLowerCase().slice(0, 12)}`;
}

export function hashApplicationArtifact(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyApplicationReleaseProviderRevision(
  expected: ApplicationReleaseProviderRevision,
  observed: ApplicationReleaseProviderRevision
): ProviderRevisionVerification {
  const expectedFingerprint = fingerprintProviderRevision(expected);
  const observedFingerprint = fingerprintProviderRevision(observed);

  return {
    matches: expectedFingerprint === observedFingerprint,
    expectedFingerprint,
    observedFingerprint
  };
}

function fingerprintProviderRevision(revision: ApplicationReleaseProviderRevision): string {
  return createHash("sha256").update(canonicalJson(revision)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}
