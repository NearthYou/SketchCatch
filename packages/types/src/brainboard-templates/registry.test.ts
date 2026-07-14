import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BrainboardFailedCaptureEvidence,
  BrainboardTemplateEvidence,
  BrainboardTemplateSource
} from "./source-types.js";

type RegistryEntry =
  | {
      readonly id: string;
      readonly status: "available";
      readonly source: BrainboardTemplateSource;
    }
  | {
      readonly evidence: BrainboardFailedCaptureEvidence;
      readonly id: string;
      readonly status: "unavailable";
    };

type PublicContract = {
  readonly brainboardFailedCaptureEvidence?: BrainboardFailedCaptureEvidence;
  readonly brainboardTemplateEvidence?: readonly BrainboardTemplateEvidence[];
  readonly brainboardTemplateManifest?: readonly {
    readonly downloads: number;
    readonly id: string;
    readonly sourceTemplateId: string;
    readonly title: string;
  }[];
  readonly brainboardTemplateRegistry?: readonly RegistryEntry[];
  readonly brainboardTemplateSources?: readonly BrainboardTemplateSource[];
};

const contract = (await import("../index.js")) as unknown as PublicContract;

test("Brainboard evidence registry keeps all 24 manifest entries in download order", () => {
  const manifest = requireValue(contract.brainboardTemplateManifest);
  const evidence = requireValue(contract.brainboardTemplateEvidence);
  const registry = requireValue(contract.brainboardTemplateRegistry);

  assert.equal(manifest.length, 24);
  assert.deepEqual(
    evidence.map(({ id }) => id),
    manifest.map(({ id }) => id)
  );
  assert.deepEqual(
    registry.map(({ id }) => id),
    manifest.map(({ id }) => id)
  );

  for (const [index, entry] of evidence.entries()) {
    const expected = manifest[index]!;
    assert.equal(entry.id, expected.id);
    assert.equal(entry.title, expected.title);
    assert.equal(entry.origin.sourceTemplateId, expected.sourceTemplateId);
    assert.equal(entry.origin.downloads, expected.downloads);
  }
});

test("deployable source registry contains exactly the 23 successful captures", () => {
  const sources = requireValue(contract.brainboardTemplateSources);
  const evidence = requireValue(contract.brainboardTemplateEvidence);
  const registry = requireValue(contract.brainboardTemplateRegistry);
  const capturedEvidence = evidence.filter(
    (entry): entry is BrainboardTemplateSource => entry.captureStatus !== "failed"
  );

  assert.equal(sources.length, 23);
  assert.deepEqual(
    sources.map(({ id }) => id),
    capturedEvidence.map(({ id }) => id)
  );
  assert.deepEqual(
    registry.filter(({ status }) => status === "available").map(({ id }) => id),
    sources.map(({ id }) => id)
  );
  assert.ok(
    sources.every(
      ({ nodes, terraform }) =>
        nodes.length > 0 && terraform.files.length > 0 && terraform.resourceAddresses.length > 0
    )
  );
});

test("failed rank 12 remains preview-only evidence without invented Diagram or Terraform", () => {
  const failed = requireValue(contract.brainboardFailedCaptureEvidence);
  const evidence = requireValue(contract.brainboardTemplateEvidence);
  const registry = requireValue(contract.brainboardTemplateRegistry);
  const failedRegistryEntry = registry.find(({ id }) => id === failed.id);

  assert.equal(failed.id, "brainboard-aws-instance-db-multiple-networks");
  assert.equal(failed.captureStatus, "failed");
  assert.equal(failed.origin.sourceTemplateId, "09fd3420-d8f0-409c-a1cc-694dba97443f");
  assert.equal(failed.origin.downloads, 460);
  assert.equal(failed.origin.previewWidth, 3840);
  assert.equal(failed.origin.previewHeight, 2160);
  assert.match(failed.origin.previewUrl, /09fd3420-d8f0-409c-a1cc-694dba97443f\.webp$/u);
  assert.equal(failed.attempts.filter(({ result }) => result.includes("HTTP 400")).length, 3);
  assert.match(failed.attempts.at(-1)?.result ?? "", /canvas stayed empty/u);
  assert.equal(evidence.filter(({ captureStatus }) => captureStatus === "failed").length, 1);
  assert.equal(failedRegistryEntry?.status, "unavailable");
  assert.equal("source" in (failedRegistryEntry ?? {}), false);
  assert.equal("diagramJson" in (failedRegistryEntry ?? {}), false);
  assert.equal("terraformFiles" in (failedRegistryEntry ?? {}), false);
});

function requireValue<T>(value: T | undefined): T {
  assert.ok(value);
  return value;
}
