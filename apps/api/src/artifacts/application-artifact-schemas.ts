import { APPLICATION_ARTIFACT_KINDS } from "@sketchcatch/types";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const applicationArtifactProviderLocationSchema = z
  .object({
    provider: z.enum(["aws", "kubernetes"]),
    accountId: z.string().trim().min(1).max(128),
    region: z.string().trim().min(1).max(64),
    storageNamespace: z.string().trim().min(1).max(512),
    artifactReference: z.string().trim().min(1).max(2_048).regex(/^[^\s\0]+$/u),
    ownershipScope: z.string().trim().regex(/^project:[A-Za-z0-9_-]{1,128}$/u)
  })
  .strict();

export const applicationArtifactEvidenceV2Schema = z
  .object({
    kind: z.enum(APPLICATION_ARTIFACT_KINDS),
    artifactFingerprint: sha256Schema,
    buildContractVersion: z.string().trim().min(1).max(128),
    digestAlgorithm: z.literal("sha256"),
    digest: sha256Schema,
    location: applicationArtifactProviderLocationSchema
  })
  .strict();
