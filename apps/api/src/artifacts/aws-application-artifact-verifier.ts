import {
  DescribeImagesCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  type ECRClientConfig
} from "@aws-sdk/client-ecr";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import type { ApplicationArtifact } from "@sketchcatch/types";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import type {
  ApplicationArtifactProviderVerification,
  ApplicationArtifactProviderVerifier
} from "./application-artifact-registry.js";

type AwsReadCommand = { readonly input: Record<string, unknown> };
type AwsReadClient = {
  send(command: AwsReadCommand): Promise<Record<string, unknown>>;
  destroy(): void;
};

type AwsArtifactVerificationContext = {
  readonly projectId: string;
  readonly accountId: string;
  readonly roleArn: string;
  readonly externalId: string;
  readonly region: string;
};

type AssumeArtifactRole = (input: {
  roleArn: string;
  externalId: string;
  region: string;
  roleSessionName: string;
}) => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;

export type AwsApplicationArtifactVerifierOptions = {
  readonly assumeRole?: AssumeArtifactRole;
  readonly createEcrClient?: (configuration: ECRClientConfig) => AwsReadClient;
  readonly createS3Client?: (configuration: S3ClientConfig) => AwsReadClient;
};

export function createAwsApplicationArtifactProviderVerifier(
  context: AwsArtifactVerificationContext,
  options: AwsApplicationArtifactVerifierOptions = {}
): ApplicationArtifactProviderVerifier {
  const assumeRole = options.assumeRole ?? (async (input) =>
    createAwsSdkStsGateway().assumeRole(input));
  const createEcrClient = options.createEcrClient ?? ((configuration) =>
    new ECRClient(configuration) as unknown as AwsReadClient);
  const createS3Client = options.createS3Client ?? ((configuration) =>
    new S3Client(configuration) as unknown as AwsReadClient);

  return {
    async verify(artifact) {
      const boundaryMiss = validateArtifactBoundary(artifact, context);
      if (boundaryMiss) return boundaryMiss;

      try {
        const credentials = await assumeRole({
          roleArn: context.roleArn,
          externalId: context.externalId,
          region: context.region,
          roleSessionName: `sketchcatch-artifact-${artifact.id.slice(0, 24)}`
        });
        const configuration = { region: context.region, credentials };

        return artifact.kind === "container_image"
          ? await verifyEcrArtifact(artifact, context, createEcrClient(configuration))
          : await verifyS3Artifact(artifact, context, createS3Client(configuration));
      } catch {
        return { outcome: "miss", reason: "provider_error" };
      }
    }
  };
}

async function verifyEcrArtifact(
  artifact: ApplicationArtifact,
  context: AwsArtifactVerificationContext,
  client: AwsReadClient
): Promise<ApplicationArtifactProviderVerification> {
  try {
    const reference = parseEcrReference(artifact.location.artifactReference);
    if (!reference) return { outcome: "miss", reason: "missing" };
    if (reference.accountId !== context.accountId) {
      return { outcome: "miss", reason: "account_mismatch" };
    }
    if (reference.region !== context.region) {
      return { outcome: "miss", reason: "region_mismatch" };
    }
    if (reference.repositoryName !== artifact.location.storageNamespace) {
      return { outcome: "miss", reason: "ownership_mismatch" };
    }

    const repositories = await client.send(
      new DescribeRepositoriesCommand({
        registryId: context.accountId,
        repositoryNames: [reference.repositoryName]
      }) as unknown as AwsReadCommand
    );
    const repository = readFirstRecord(repositories.repositories);
    if (!repository) return { outcome: "miss", reason: "missing" };
    if (repository.registryId !== context.accountId) {
      return { outcome: "miss", reason: "account_mismatch" };
    }
    if (repository.repositoryName !== reference.repositoryName) {
      return { outcome: "miss", reason: "ownership_mismatch" };
    }
    const images = await client.send(
      new DescribeImagesCommand({
        registryId: context.accountId,
        repositoryName: reference.repositoryName,
        imageIds: [{ imageDigest: `sha256:${artifact.digest}` }]
      }) as unknown as AwsReadCommand
    );
    const image = readFirstRecord(images.imageDetails);
    if (!image) return { outcome: "miss", reason: "missing" };
    if (image.imageDigest !== `sha256:${artifact.digest}` || reference.digest !== artifact.digest) {
      return { outcome: "miss", reason: "digest_mismatch" };
    }

    return { outcome: "verified", digest: artifact.digest, location: artifact.location };
  } finally {
    client.destroy();
  }
}

async function verifyS3Artifact(
  artifact: ApplicationArtifact,
  context: AwsArtifactVerificationContext,
  client: AwsReadClient
): Promise<ApplicationArtifactProviderVerification> {
  try {
    const reference = parseS3Reference(artifact.location.artifactReference);
    if (!reference) return { outcome: "miss", reason: "missing" };
    if (reference.bucket !== artifact.location.storageNamespace) {
      return { outcome: "miss", reason: "ownership_mismatch" };
    }

    const request = {
      Bucket: reference.bucket,
      Key: reference.key,
      ExpectedBucketOwner: context.accountId
    };
    const head = await client.send(
      new HeadObjectCommand({ ...request, ChecksumMode: "ENABLED" }) as unknown as AwsReadCommand
    );
    if (!(await hasMatchingS3Digest(head, artifact.digest, client, request))) {
      return { outcome: "miss", reason: "digest_mismatch" };
    }

    return { outcome: "verified", digest: artifact.digest, location: artifact.location };
  } finally {
    client.destroy();
  }
}

function validateArtifactBoundary(
  artifact: ApplicationArtifact,
  context: AwsArtifactVerificationContext
): ApplicationArtifactProviderVerification | null {
  if (artifact.projectId !== context.projectId) {
    return { outcome: "miss", reason: "ownership_mismatch" };
  }
  if (artifact.location.provider !== "aws") {
    return { outcome: "miss", reason: "provider_error" };
  }
  if (artifact.location.accountId !== context.accountId) {
    return { outcome: "miss", reason: "account_mismatch" };
  }
  if (artifact.location.region !== context.region) {
    return { outcome: "miss", reason: "region_mismatch" };
  }
  if (artifact.location.ownershipScope !== `project:${context.projectId}`) {
    return { outcome: "miss", reason: "ownership_mismatch" };
  }
  const roleAccountId = /^arn:[^:]+:iam::(\d{12}):role\//u.exec(context.roleArn)?.[1];
  if (roleAccountId !== context.accountId) {
    return { outcome: "miss", reason: "account_mismatch" };
  }
  return null;
}

function parseEcrReference(value: string): {
  accountId: string;
  region: string;
  repositoryName: string;
  digest: string;
} | null {
  const match = /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\/(.+)@sha256:([a-f0-9]{64})$/u.exec(
    value
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  return {
    accountId: match[1],
    region: match[2],
    repositoryName: match[3],
    digest: match[4]
  };
}

function parseS3Reference(value: string): { bucket: string; key: string } | null {
  const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\/(.+)$/u.exec(value);
  if (!match?.[1] || !match[2] || /[\s\0?#]/u.test(match[2])) return null;
  return { bucket: match[1], key: match[2] };
}

async function hasMatchingS3Digest(
  response: Record<string, unknown>,
  digest: string,
  client: AwsReadClient,
  request: { Bucket: string; Key: string; ExpectedBucketOwner: string }
): Promise<boolean> {
  const checksum = readNonEmptyString(response.ChecksumSHA256);
  if (checksum === Buffer.from(digest, "hex").toString("base64")) return true;

  const object = await client.send(
    new GetObjectCommand(request) as unknown as AwsReadCommand
  );
  return (await hashProviderBody(object.Body)) === digest;
}

async function hashProviderBody(body: unknown): Promise<string | null> {
  const hash = createHash("sha256");
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      hash.update(chunk);
    }
    return hash.digest("hex");
  }
  if (
    body &&
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    hash.update(await body.transformToByteArray());
    return hash.digest("hex");
  }
  return null;
}

function readFirstRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
