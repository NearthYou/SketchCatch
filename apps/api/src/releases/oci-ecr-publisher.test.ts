import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadVerifiedOciLayout,
  publishOciLayoutToEcr,
  type EcrPublisherClient
} from "./oci-ecr-publisher.js";

test("verified OCI layout uploads missing blobs and requires the expected ECR digest", async () => {
  const fixture = await createOciFixture();
  const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  const client: EcrPublisherClient = {
    async send(command) {
      const name = command.constructor.name;
      if (!["BatchGetImageCommand", "BatchCheckLayerAvailabilityCommand"].includes(name)) {
        assert.ok(mutationGuardCount > commands.filter(isMutationCommand).length);
      }
      commands.push({ name, input: command.input as unknown as Record<string, unknown> });
      if (name === "BatchGetImageCommand") return { failures: [] };
      if (name === "BatchCheckLayerAvailabilityCommand") {
        return {
          layers: (command.input as { layerDigests: string[] }).layerDigests.map(
            (layerDigest) => ({ layerDigest, layerAvailability: "MISSING" })
          )
        };
      }
      if (name === "InitiateLayerUploadCommand") {
        return { uploadId: `upload-${commands.length}`, partSize: 5 * 1024 * 1024 };
      }
      if (name === "PutImageCommand") {
        return { image: { imageId: { imageDigest: `sha256:${fixture.manifestDigest}` } } };
      }
      return {};
    }
  };
  let mutationGuardCount = 0;

  try {
    const artifact = await loadVerifiedOciLayout(fixture.root, fixture.manifestDigest);
    const result = await publishOciLayoutToEcr(
      artifact,
      { repositoryName: "demo-api", imageTag: "a".repeat(40) },
      client,
      { beforeMutation: async () => { mutationGuardCount += 1; } }
    );

    assert.equal(result.imageDigest, `sha256:${fixture.manifestDigest}`);
    assert.equal(
      commands.filter((command) => command.name === "CompleteLayerUploadCommand").length,
      2
    );
    const putImage = commands.find((command) => command.name === "PutImageCommand");
    assert.equal(putImage?.input["repositoryName"], "demo-api");
    assert.equal(putImage?.input["imageTag"], "a".repeat(40));
    assert.equal(mutationGuardCount, commands.filter(isMutationCommand).length);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

function isMutationCommand(command: { name: string }): boolean {
  return !["BatchGetImageCommand", "BatchCheckLayerAvailabilityCommand"].includes(command.name);
}

test("an existing immutable ECR tag is reused only when its digest matches", async () => {
  const fixture = await createOciFixture();
  const commands: string[] = [];
  let mutationGuardCount = 0;
  const client: EcrPublisherClient = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === "BatchGetImageCommand") {
        return {
          images: [{ imageId: { imageDigest: `sha256:${fixture.manifestDigest}` } }]
        };
      }
      throw new Error("an exact immutable tag must not upload blobs or put an image");
    }
  };

  try {
    const artifact = await loadVerifiedOciLayout(fixture.root, fixture.manifestDigest);
    const result = await publishOciLayoutToEcr(
      artifact,
      { repositoryName: "demo-api", imageTag: "a".repeat(40) },
      client,
      { beforeMutation: async () => { mutationGuardCount += 1; } }
    );

    assert.equal(result.imageDigest, `sha256:${fixture.manifestDigest}`);
    assert.deepEqual(commands, ["BatchGetImageCommand"]);
    assert.equal(mutationGuardCount, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("an immutable ECR tag collision fails before any mutation", async () => {
  const fixture = await createOciFixture();
  const commands: string[] = [];
  let mutationGuardCount = 0;
  const client: EcrPublisherClient = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === "BatchGetImageCommand") {
        return {
          images: [{ imageId: { imageDigest: `sha256:${"f".repeat(64)}` } }]
        };
      }
      throw new Error("a colliding immutable tag must not reach mutation calls");
    }
  };

  try {
    const artifact = await loadVerifiedOciLayout(fixture.root, fixture.manifestDigest);
    await assert.rejects(
      publishOciLayoutToEcr(
        artifact,
        { repositoryName: "demo-api", imageTag: "a".repeat(40) },
        client,
        { beforeMutation: async () => { mutationGuardCount += 1; } }
      ),
      /already points to a different image digest/u
    );
    assert.deepEqual(commands, ["BatchGetImageCommand"]);
    assert.equal(mutationGuardCount, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("OCI layout verification rejects a blob whose bytes changed", async () => {
  const fixture = await createOciFixture();
  try {
    await writeFile(fixture.layerPath, "tampered-layer!!");
    await assert.rejects(
      loadVerifiedOciLayout(fixture.root, fixture.manifestDigest),
      /OCI blob digest does not match/u
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createOciFixture() {
  const root = await mkdtemp(join(tmpdir(), "sketchcatch-oci-"));
  const blobs = join(root, "blobs", "sha256");
  await mkdir(blobs, { recursive: true });
  const config = Buffer.from('{"architecture":"amd64","os":"linux"}');
  const layer = Buffer.from("compressed-layer");
  const configDigest = sha256(config);
  const layerDigest = sha256(layer);
  const layerPath = join(blobs, layerDigest);
  await writeFile(join(blobs, configDigest), config);
  await writeFile(layerPath, layer);
  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: `sha256:${configDigest}`,
      size: config.length
    },
    layers: [
      {
        mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
        digest: `sha256:${layerDigest}`,
        size: layer.length
      }
    ]
  });
  const manifestDigest = sha256(manifest);
  await writeFile(join(blobs, manifestDigest), manifest);
  await writeFile(join(root, "oci-layout"), '{"imageLayoutVersion":"1.0.0"}');
  await writeFile(
    join(root, "index.json"),
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          digest: `sha256:${manifestDigest}`,
          size: Buffer.byteLength(manifest)
        }
      ]
    })
  );
  return { root, layerPath, manifestDigest };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
