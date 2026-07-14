import { brainboardTemplateManifest } from "./manifest.ts";
import type {
  BrainboardFailedCaptureEvidence,
  BrainboardTemplateEvidence,
  BrainboardTemplateSource
} from "./source-types.ts";
import {
  awsInstanceDatabaseMultipleNetworksFailedEvidence,
  brainboardTemplateSources
} from "./sources/index.ts";

export type BrainboardTemplateRegistryEntry =
  | {
      readonly id: BrainboardTemplateSource["id"];
      readonly status: "available";
      readonly source: BrainboardTemplateSource;
    }
  | {
      readonly id: BrainboardFailedCaptureEvidence["id"];
      readonly status: "unavailable";
      readonly evidence: BrainboardFailedCaptureEvidence;
    };

export const brainboardFailedCaptureEvidence = awsInstanceDatabaseMultipleNetworksFailedEvidence;

const evidenceById = new Map<string, BrainboardTemplateEvidence>([
  ...brainboardTemplateSources.map((source) => [source.id, source] as const),
  [brainboardFailedCaptureEvidence.id, brainboardFailedCaptureEvidence] as const
]);

export const brainboardTemplateEvidence = brainboardTemplateManifest.map((manifestEntry) => {
  const evidence = evidenceById.get(manifestEntry.id);
  if (evidence === undefined) {
    throw new Error(`Missing Brainboard evidence for ${manifestEntry.id}.`);
  }
  if (
    evidence.title !== manifestEntry.title ||
    evidence.origin.sourceTemplateId !== manifestEntry.sourceTemplateId ||
    evidence.origin.downloads !== manifestEntry.downloads
  ) {
    throw new Error(`Brainboard evidence does not match manifest entry ${manifestEntry.id}.`);
  }
  return evidence;
}) satisfies readonly BrainboardTemplateEvidence[];

if (evidenceById.size !== brainboardTemplateManifest.length) {
  throw new Error("Brainboard evidence registry contains duplicate or unexpected entries.");
}

export const brainboardTemplateRegistry = brainboardTemplateEvidence.map(
  (evidence): BrainboardTemplateRegistryEntry =>
    evidence.captureStatus === "failed"
      ? { id: evidence.id, status: "unavailable", evidence }
      : { id: evidence.id, status: "available", source: evidence }
);
