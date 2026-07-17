import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import test from "node:test";
import {
  loadFrontendReleaseCandidateArtifacts,
  loadReleaseCandidateArtifacts,
  type ReleaseCandidateArtifactReference
} from "./release-candidate-artifact-loader.js";

const execFileAsync = promisify(execFile);

test("loader pins S3 versions and verifies OCI and every frontend file", async () => {
  const fixture = await createFixture();
  try {
    const requestedVersions: string[] = [];
    const loaded = await loadReleaseCandidateArtifacts(fixture.reference, {
      bucketName: "internal-artifacts",
      s3Client: {
        async send(command) {
          const input = command.input;
          requestedVersions.push(String(input.VersionId));
          const body = fixture.objects.get(`${input.Key}@${input.VersionId}`);
          if (!body) throw new Error("missing fixture object");
          return { Body: Readable.from([body]) };
        }
      }
    });
    try {
      assert.equal(loaded.oci.manifestDigest, `sha256:${fixture.reference.apiOciDigest}`);
      assert.equal(loaded.frontendManifest.marker, `${fixture.reference.commitSha}:candidate-1`);
      assert.deepEqual(requestedVersions.sort(), ["api-v1", "candidate-v1", "frontend-v1", "manifest-v1"]);
    } finally {
      await loaded.cleanup();
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("loader rejects bytes that differ from the approved archive checksum", async () => {
  const fixture = await createFixture();
  fixture.objects.set(
    `${fixture.reference.apiArchiveObjectKey}@${fixture.reference.apiArchiveObjectVersionId}`,
    Buffer.alloc(fixture.reference.apiArchiveByteSize, 7)
  );
  try {
    await assert.rejects(
      loadReleaseCandidateArtifacts(fixture.reference, {
        bucketName: "internal-artifacts",
        s3Client: {
          async send(command) {
            const input = command.input;
            const body = fixture.objects.get(`${input.Key}@${input.VersionId}`);
            if (!body) throw new Error("missing fixture object");
            return { Body: Readable.from([body]) };
          }
        }
      }),
      /checksum does not match approved candidate/u
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("frontend retry loader verifies only the retained frontend Artifact", async () => {
  const fixture = await createFixture();
  try {
    const requestedKeys: string[] = [];
    const loaded = await loadFrontendReleaseCandidateArtifacts(fixture.reference, {
      bucketName: "internal-artifacts",
      s3Client: {
        async send(command) {
          const input = command.input;
          requestedKeys.push(String(input.Key));
          const body = fixture.objects.get(`${input.Key}@${input.VersionId}`);
          if (!body) throw new Error("missing fixture object");
          return { Body: Readable.from([body]) };
        }
      }
    });
    try {
      assert.equal(loaded.frontendManifest.marker, `${fixture.reference.commitSha}:candidate-1`);
      assert.equal(requestedKeys.includes(fixture.reference.apiArchiveObjectKey), false);
      assert.deepEqual(requestedKeys.sort(), [
        fixture.reference.frontendArchiveObjectKey,
        fixture.reference.frontendManifestObjectKey,
        fixture.reference.manifestObjectKey
      ].sort());
    } finally {
      await loaded.cleanup();
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "sketchcatch-loader-test-"));
  const ociRoot = join(root, "oci");
  const blobRoot = join(ociRoot, "blobs", "sha256");
  const frontendRoot = join(root, "frontend");
  await mkdir(blobRoot, { recursive: true });
  await mkdir(frontendRoot);

  const config = Buffer.from('{"architecture":"amd64","os":"linux"}');
  const layer = Buffer.from("layer");
  const configDigest = sha256(config);
  const layerDigest = sha256(layer);
  await writeFile(join(blobRoot, configDigest), config);
  await writeFile(join(blobRoot, layerDigest), layer);
  const imageManifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: `sha256:${configDigest}`,
      size: config.byteLength
    },
    layers: [
      {
        mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
        digest: `sha256:${layerDigest}`,
        size: layer.byteLength
      }
    ]
  });
  const apiOciDigest = sha256(imageManifest);
  await writeFile(join(blobRoot, apiOciDigest), imageManifest);
  await writeFile(join(ociRoot, "oci-layout"), '{"imageLayoutVersion":"1.0.0"}');
  await writeFile(
    join(ociRoot, "index.json"),
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          digest: `sha256:${apiOciDigest}`,
          size: Buffer.byteLength(imageManifest)
        }
      ]
    })
  );

  const commitSha = "a".repeat(40);
  const marker = `${commitSha}:candidate-1`;
  const indexContents = `<html><head><meta name="sketchcatch-release" content="${marker}"></head></html>`;
  const releaseContents = JSON.stringify({ commitSha, candidateId: "candidate-1", marker });
  await writeFile(join(frontendRoot, "index.html"), indexContents);
  await writeFile(join(frontendRoot, "sketchcatch-release.json"), releaseContents);
  const frontendManifestText = JSON.stringify({
    schemaVersion: 1,
    commitSha,
    candidateId: "candidate-1",
    marker,
    index: { path: "index.html", sha256: sha256(indexContents) },
    files: [
      {
        path: "index.html",
        sha256: sha256(indexContents),
        size: Buffer.byteLength(indexContents),
        contentType: "text/html; charset=utf-8"
      },
      {
        path: "sketchcatch-release.json",
        sha256: sha256(releaseContents),
        size: Buffer.byteLength(releaseContents),
        contentType: "application/json; charset=utf-8"
      }
    ]
  });

  const apiArchivePath = join(root, "api.tar");
  const frontendArchivePath = join(root, "frontend.tar.zst");
  await execFileAsync("tar", ["--create", "--file", apiArchivePath, "--directory", ociRoot, "."]);
  await execFileAsync("tar", [
    "--zstd",
    "--create",
    "--file",
    frontendArchivePath,
    "--directory",
    frontendRoot,
    "."
  ]);
  const apiArchive = await readFile(apiArchivePath);
  const frontendArchive = await readFile(frontendArchivePath);
  const frontendManifest = Buffer.from(frontendManifestText);
  const configFingerprint = "b".repeat(64);
  const compositeDigest = "c".repeat(64);
  const reference: ReleaseCandidateArtifactReference = {
    projectId: "12345678-1234-1234-1234-1234567890ab",
    candidateId: "candidate-1",
    commitSha,
    configFingerprint,
    compositeDigest,
    apiOciDigest,
    apiArchiveDigest: sha256(apiArchive),
    apiArchiveByteSize: apiArchive.byteLength,
    frontendArchiveDigest: sha256(frontendArchive),
    frontendArchiveByteSize: frontendArchive.byteLength,
    frontendManifestDigest: sha256(frontendManifest),
    frontendIndexDigest: sha256(indexContents),
    apiArchiveObjectKey:
      "deployments/deployment-1/release-candidates/candidate-1/api-image.oci.tar",
    apiArchiveObjectVersionId: "api-v1",
    frontendArchiveObjectKey:
      "deployments/deployment-1/release-candidates/candidate-1/frontend.tar.zst",
    frontendArchiveObjectVersionId: "frontend-v1",
    frontendManifestObjectKey:
      "deployments/deployment-1/release-candidates/candidate-1/frontend-manifest.json",
    frontendManifestObjectVersionId: "manifest-v1",
    manifestObjectKey:
      "deployments/deployment-1/release-candidates/candidate-1/candidate-manifest.json",
    manifestObjectVersionId: "candidate-v1"
  };
  const candidateManifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      projectId: reference.projectId,
      candidateId: reference.candidateId,
      commitSha,
      configFingerprint,
      compositeDigest: {
        algorithm: "sha256",
        value: compositeDigest,
        apiOciDigest,
        frontendManifestDigest: reference.frontendManifestDigest
      },
      artifacts: {
        api: {
          objectKey: reference.apiArchiveObjectKey,
          versionId: reference.apiArchiveObjectVersionId,
          byteSize: reference.apiArchiveByteSize,
          sha256: reference.apiArchiveDigest,
          ociManifestDigest: apiOciDigest
        },
        frontend: {
          objectKey: reference.frontendArchiveObjectKey,
          versionId: reference.frontendArchiveObjectVersionId,
          byteSize: reference.frontendArchiveByteSize,
          sha256: reference.frontendArchiveDigest
        },
        frontendManifest: {
          objectKey: reference.frontendManifestObjectKey,
          versionId: reference.frontendManifestObjectVersionId,
          byteSize: frontendManifest.byteLength,
          sha256: reference.frontendManifestDigest
        }
      }
    })
  );
  const objects = new Map<string, Buffer>([
    [`${reference.apiArchiveObjectKey}@${reference.apiArchiveObjectVersionId}`, apiArchive],
    [
      `${reference.frontendArchiveObjectKey}@${reference.frontendArchiveObjectVersionId}`,
      frontendArchive
    ],
    [
      `${reference.frontendManifestObjectKey}@${reference.frontendManifestObjectVersionId}`,
      frontendManifest
    ],
    [`${reference.manifestObjectKey}@${reference.manifestObjectVersionId}`, candidateManifest]
  ]);
  return { root, reference, objects };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
