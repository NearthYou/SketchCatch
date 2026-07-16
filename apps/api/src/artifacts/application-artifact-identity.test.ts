import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { ApplicationArtifactFingerprintInput } from "@sketchcatch/types";
import { createApplicationArtifactIdentity } from "./application-artifact-identity.js";

const commitSha = "a".repeat(40);

function createInput(): ApplicationArtifactFingerprintInput {
  return {
    repository: {
      provider: "github",
      owner: "NearthYou",
      name: "SketchCatch"
    },
    commitSha,
    kind: "container_image",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [
        { kind: "package_manifest", path: "package.json" },
        { kind: "dockerfile", path: "Dockerfile" }
      ],
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "Dockerfile",
      packageManifestPath: "package.json",
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: "1.0.0",
      confirmedCommitSha: commitSha,
      confirmedAt: "2026-07-16T00:00:00.000Z"
    },
    buildContractVersion: "application-artifact/v1",
    targetOs: "Linux",
    targetArchitecture: "x86_64",
    buildInputs: {
      lockfileSha256: "b".repeat(64),
      sourceSubmodulesSha256: null
    }
  };
}

test("canonical fingerprint ignores confirmation time, key order, and non-byte orchestration", () => {
  const first = createInput();
  const second = createInput();
  second.confirmedBuildConfig.confirmedAt = "2026-07-16T03:00:00.000Z";
  second.confirmedBuildConfig.evidence.reverse();
  second.buildInputs = {
    sourceSubmodulesSha256: null,
    lockfileSha256: "b".repeat(64)
  };

  const firstIdentity = createApplicationArtifactIdentity({
    ...first,
    orchestrator: { runner: "codebuild", capacity: "large" }
  } as ApplicationArtifactFingerprintInput);
  const secondIdentity = createApplicationArtifactIdentity({
    ...second,
    orchestrator: { runner: "github_actions", capacity: "2xlarge" }
  } as ApplicationArtifactFingerprintInput);

  assert.deepEqual(firstIdentity, secondIdentity);
  assert.equal(firstIdentity.repositoryIdentity, "github:nearthyou/sketchcatch");
  assert.equal(firstIdentity.targetOs, "linux");
  assert.equal(firstIdentity.targetArchitecture, "amd64");
  assert.match(firstIdentity.artifactFingerprint, /^[a-f0-9]{64}$/u);
});

test("canonical fingerprint changes when byte-affecting build identity changes", () => {
  const first = createInput();
  const second = createInput();
  second.buildInputs.lockfileSha256 = "c".repeat(64);

  assert.notEqual(
    createApplicationArtifactIdentity(first).artifactFingerprint,
    createApplicationArtifactIdentity(second).artifactFingerprint
  );
});

test("canonical fingerprint normalizes equivalent repository-relative build paths", () => {
  const first = createInput();
  const second = createInput();
  second.confirmedBuildConfig.sourceRoot = "./";
  second.confirmedBuildConfig.evidence = [
    { kind: "dockerfile", path: ".\\Dockerfile" },
    { kind: "package_manifest", path: "config/../package.json" }
  ];
  second.confirmedBuildConfig.dockerfilePath = "./Dockerfile";
  second.confirmedBuildConfig.packageManifestPath = "config/../package.json";

  assert.equal(
    createApplicationArtifactIdentity(first).artifactFingerprint,
    createApplicationArtifactIdentity(second).artifactFingerprint
  );
});

test("secret-free build input values preserve byte-affecting whitespace", () => {
  const first = createInput();
  const second = createInput();
  first.buildInputs.compilerFlags = "--define=value";
  second.buildInputs.compilerFlags = "--define=value ";

  assert.notEqual(
    createApplicationArtifactIdentity(first).artifactFingerprint,
    createApplicationArtifactIdentity(second).artifactFingerprint
  );
});

test("canonical build evidence ordering uses code points instead of the host locale", () => {
  const input = createInput();
  input.confirmedBuildConfig.evidence = [
    { kind: "package_manifest", path: "ä.json" },
    { kind: "package_manifest", path: "z.json" },
    { kind: "package_manifest", path: "a.json" }
  ];

  const expectedBuildConfig = {
    sourceRoot: ".",
    evidence: [
      { kind: "package_manifest", path: "a.json" },
      { kind: "package_manifest", path: "z.json" },
      { kind: "package_manifest", path: "ä.json" }
    ],
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "Dockerfile",
    packageManifestPath: "package.json",
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: "1.0.0"
  };
  const expectedHash = createHash("sha256")
    .update(JSON.stringify(toCanonicalValue(expectedBuildConfig)))
    .digest("hex");

  assert.equal(createApplicationArtifactIdentity(input).buildConfigSha256, expectedHash);
});

test("canonical fingerprint rejects secret-shaped inputs and commit mismatches", () => {
  const secretInput = createInput();
  secretInput.buildInputs.apiToken = "must-not-enter-the-fingerprint";

  assert.throws(
    () => createApplicationArtifactIdentity(secretInput),
    /secret-free build input key/i
  );

  const mismatchedCommit = createInput();
  mismatchedCommit.confirmedBuildConfig.confirmedCommitSha = "d".repeat(40);

  assert.throws(
    () => createApplicationArtifactIdentity(mismatchedCommit),
    /confirmed build commit/i
  );
});

test("secret-free build input keys reject repeated delimiter bypasses", () => {
  for (const secretKey of ["api__key", "private--key"] as const) {
    const input = createInput();
    input.buildInputs[secretKey] = "must-not-enter-the-fingerprint";

    assert.throws(
      () => createApplicationArtifactIdentity(input),
      /secret-free build input key/i
    );
  }
});

test("canonical fingerprint rejects malformed build input containers", () => {
  for (const buildInputs of [null, ["unexpected"]] as const) {
    const input = {
      ...createInput(),
      buildInputs
    } as unknown as ApplicationArtifactFingerprintInput;

    assert.throws(
      () => createApplicationArtifactIdentity(input),
      /build inputs must be a record/i
    );
  }
});

function toCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCanonicalValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, toCanonicalValue(child)])
    );
  }
  return value;
}
