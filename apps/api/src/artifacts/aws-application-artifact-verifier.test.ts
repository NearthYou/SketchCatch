import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { ApplicationArtifact } from "@sketchcatch/types";
import { createAwsApplicationArtifactProviderVerifier } from "./aws-application-artifact-verifier.js";

const digest = "a".repeat(64);

test("ECR verification checks repository account, image digest, region, and approved project target", async () => {
  const commands: string[] = [];
  const artifact = createArtifact({
    kind: "container_image",
    storageNamespace: "customer-api",
    artifactReference:
      `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:${digest}`
  });
  const verifier = createAwsApplicationArtifactProviderVerifier(createContext(), {
    async assumeRole() { return { accessKeyId: "test", secretAccessKey: "test" }; },
    createEcrClient() {
      return {
        async send(command) {
          commands.push(command.constructor.name);
          if (command.constructor.name === "DescribeRepositoriesCommand") {
            return {
              repositories: [{
                registryId: "123456789012",
                repositoryName: "customer-api",
                repositoryArn: "arn:aws:ecr:ap-northeast-2:123456789012:repository/customer-api"
              }]
            };
          }
          if (command.constructor.name === "DescribeImagesCommand") {
            return { imageDetails: [{ imageDigest: `sha256:${digest}` }] };
          }
          throw new Error("unexpected ECR command");
        },
        destroy() {}
      };
    }
  });

  assert.deepEqual(await verifier.verify(artifact), {
    outcome: "verified",
    digest,
    location: artifact.location
  });
  assert.deepEqual(commands, [
    "DescribeRepositoriesCommand",
    "DescribeImagesCommand"
  ]);
});

test("S3 verification uses expected bucket owner, checksum, and approved project target", async () => {
  const artifact = createArtifact({
    kind: "lambda_zip",
    storageNamespace: "customer-artifacts",
    artifactReference: "s3://customer-artifacts/releases/function.zip"
  });
  const seenInputs: Record<string, unknown>[] = [];
  const verifier = createAwsApplicationArtifactProviderVerifier(createContext(), {
    async assumeRole() { return { accessKeyId: "test", secretAccessKey: "test" }; },
    createS3Client() {
      return {
        async send(command) {
          seenInputs.push(command.input);
          return { ChecksumSHA256: Buffer.from(digest, "hex").toString("base64") };
        },
        destroy() {}
      };
    }
  });

  assert.equal((await verifier.verify(artifact)).outcome, "verified");
  assert.equal(seenInputs[0]?.ExpectedBucketOwner, "123456789012");
  assert.equal(seenInputs[0]?.ChecksumMode, "ENABLED");
});

test("S3 verification does not trust caller-controlled digest metadata", async () => {
  const artifact = createArtifact({
    kind: "lambda_zip",
    storageNamespace: "customer-artifacts",
    artifactReference: "s3://customer-artifacts/releases/function.zip"
  });
  const commands: string[] = [];
  const verifier = createAwsApplicationArtifactProviderVerifier(createContext(), {
    async assumeRole() { return { accessKeyId: "test", secretAccessKey: "test" }; },
    createS3Client() {
      return {
        async send(command) {
          commands.push(command.constructor.name);
          if (command.constructor.name === "HeadObjectCommand") {
            return { Metadata: { "sketchcatch-artifact-sha256": digest } };
          }
          if (command.constructor.name === "GetObjectCommand") {
            return {
              Body: {
                async transformToByteArray() {
                  return Buffer.from("different object bytes", "utf8");
                }
              }
            };
          }
          throw new Error("unexpected S3 command");
        },
        destroy() {}
      };
    }
  });

  assert.deepEqual(await verifier.verify(artifact), {
    outcome: "miss",
    reason: "digest_mismatch"
  });
  assert.deepEqual(commands, ["HeadObjectCommand", "GetObjectCommand"]);
});

test("S3 verification streams provider bodies before buffering them", async () => {
  const chunks = [Buffer.from("large "), Buffer.from("artifact bytes")];
  const streamedDigest = createHash("sha256")
    .update(Buffer.concat(chunks))
    .digest("hex");
  const artifact = createArtifact({
    kind: "lambda_zip",
    storageNamespace: "customer-artifacts",
    artifactReference: "s3://customer-artifacts/releases/function.zip",
    digest: streamedDigest
  });
  let transformedToByteArray = false;
  const verifier = createAwsApplicationArtifactProviderVerifier(createContext(), {
    async assumeRole() { return { accessKeyId: "test", secretAccessKey: "test" }; },
    createS3Client() {
      return {
        async send(command) {
          if (command.constructor.name === "HeadObjectCommand") return {};
          if (command.constructor.name === "GetObjectCommand") {
            return {
              Body: {
                async *[Symbol.asyncIterator]() {
                  for (const chunk of chunks) yield chunk;
                },
                async transformToByteArray() {
                  transformedToByteArray = true;
                  throw new Error("stream-capable bodies must not be buffered");
                }
              }
            };
          }
          throw new Error("unexpected S3 command");
        },
        destroy() {}
      };
    }
  });

  assert.deepEqual(await verifier.verify(artifact), {
    outcome: "verified",
    digest: streamedDigest,
    location: artifact.location
  });
  assert.equal(transformedToByteArray, false);
});

test("a changed provider digest is a cache miss", async () => {
  const artifact = createArtifact({
    kind: "container_image",
    storageNamespace: "customer-api",
    artifactReference:
      `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:${digest}`
  });
  const verifier = createAwsApplicationArtifactProviderVerifier(createContext(), {
    async assumeRole() { return { accessKeyId: "test", secretAccessKey: "test" }; },
    createEcrClient() {
      return {
        async send(command) {
          if (command.constructor.name === "DescribeRepositoriesCommand") {
            return {
              repositories: [{
                registryId: "123456789012",
                repositoryName: "customer-api",
                repositoryArn: "repository-arn"
              }]
            };
          }
          if (command.constructor.name === "DescribeImagesCommand") {
            return { imageDetails: [{ imageDigest: `sha256:${"b".repeat(64)}` }] };
          }
          return { tags: [] };
        },
        destroy() {}
      };
    }
  });

  assert.deepEqual(await verifier.verify(artifact), {
    outcome: "miss",
    reason: "digest_mismatch"
  });
});

function createContext() {
  return {
    projectId: "project-1",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    externalId: "external-id",
    region: "ap-northeast-2"
  };
}

function createArtifact(input: {
  kind: ApplicationArtifact["kind"];
  storageNamespace: string;
  artifactReference: string;
  digest?: string;
}): ApplicationArtifact {
  const timestamp = "2026-07-16T00:00:00.000Z";
  return {
    id: "artifact-1",
    projectId: "project-1",
    sourceRepositoryId: "repository-1",
    kind: input.kind,
    artifactFingerprint: "b".repeat(64),
    repositoryIdentity: "github:nearthyou/sketchcatch",
    commitSha: "c".repeat(40),
    buildConfigSha256: "d".repeat(64),
    buildContractVersion: "application-artifact/v1",
    targetOs: "linux",
    targetArchitecture: "amd64",
    buildInputIdentitySha256: "e".repeat(64),
    digestAlgorithm: "sha256",
    digest: input.digest ?? digest,
    location: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2",
      storageNamespace: input.storageNamespace,
      artifactReference: input.artifactReference,
      ownershipScope: "project:project-1"
    },
    status: "available",
    verifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
