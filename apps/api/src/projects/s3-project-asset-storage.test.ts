import { test } from "node:test";
import assert from "node:assert/strict";
import { DeleteObjectsCommand, ListObjectVersionsCommand, type S3Client } from "@aws-sdk/client-s3";
import { createS3ProjectAssetStorage } from "./s3-project-asset-storage.js";

test("S3 project prefix deletion removes every object version and delete marker across pages", async () => {
  const commands: unknown[] = [];
  let listCallCount = 0;
  const s3Client = {
    async send(command: unknown) {
      commands.push(command);

      if (command instanceof ListObjectVersionsCommand) {
        listCallCount += 1;

        if (listCallCount === 1) {
          return {
            Versions: [
              {
                Key: "projects/project-1/assets/main.tf",
                VersionId: "version-1"
              }
            ],
            DeleteMarkers: [
              {
                Key: "projects/project-1/assets/main.tf",
                VersionId: "delete-marker-1"
              }
            ],
            IsTruncated: true,
            NextKeyMarker: "projects/project-1/assets/main.tf",
            NextVersionIdMarker: "delete-marker-1"
          };
        }

        if (listCallCount === 3) {
          return {
            Versions: [],
            DeleteMarkers: [],
            IsTruncated: false
          };
        }

        return {
          Versions: [
            {
              Key: "projects/project-1/assets/thumbnail.webp",
              VersionId: "version-2"
            }
          ],
          DeleteMarkers: [],
          IsTruncated: true
        };
      }

      if (command instanceof DeleteObjectsCommand) {
        return { Errors: [] };
      }

      throw new Error("Unexpected S3 command");
    }
  };
  const storage = createS3ProjectAssetStorage({
    bucketName: "artifact-bucket",
    s3Client: s3Client as unknown as S3Client
  });

  assert.ok(storage.deletePrefix);
  await storage.deletePrefix({ prefix: "projects/project-1/" });

  assert.equal(commands.length, 5);
  assert.deepEqual(
    commands.map((command) => (command as { constructor: unknown }).constructor),
    [
      ListObjectVersionsCommand,
      DeleteObjectsCommand,
      ListObjectVersionsCommand,
      DeleteObjectsCommand,
      ListObjectVersionsCommand
    ]
  );
  assert.deepEqual((commands[1] as DeleteObjectsCommand).input.Delete?.Objects, [
    {
      Key: "projects/project-1/assets/main.tf",
      VersionId: "version-1"
    },
    {
      Key: "projects/project-1/assets/main.tf",
      VersionId: "delete-marker-1"
    }
  ]);
  assert.equal((commands[2] as ListObjectVersionsCommand).input.KeyMarker, undefined);
  assert.equal((commands[2] as ListObjectVersionsCommand).input.VersionIdMarker, undefined);
});

test("S3 project prefix deletion fails when S3 reports an object version error", async () => {
  const s3Client = {
    async send(command: unknown) {
      if (command instanceof ListObjectVersionsCommand) {
        return {
          Versions: [
            {
              Key: "projects/project-1/assets/main.tf",
              VersionId: "version-1"
            }
          ],
          IsTruncated: false
        };
      }

      return {
        Errors: [{ Code: "AccessDenied", Key: "projects/project-1/assets/main.tf" }]
      };
    }
  };
  const storage = createS3ProjectAssetStorage({
    bucketName: "artifact-bucket",
    s3Client: s3Client as unknown as S3Client
  });

  assert.ok(storage.deletePrefix);
  await assert.rejects(
    storage.deletePrefix({ prefix: "projects/project-1/" }),
    /Failed to delete every S3 object version/
  );
});

test("S3 project prefix deletion stops when deleted versions remain visible", async () => {
  const commands: unknown[] = [];
  const s3Client = {
    async send(command: unknown) {
      commands.push(command);

      if (command instanceof ListObjectVersionsCommand) {
        return {
          Versions: [
            {
              Key: "projects/project-1/assets/main.tf",
              VersionId: "version-1"
            }
          ],
          DeleteMarkers: []
        };
      }

      return { Errors: [] };
    }
  };
  const storage = createS3ProjectAssetStorage({
    bucketName: "artifact-bucket",
    s3Client: s3Client as unknown as S3Client
  });

  assert.ok(storage.deletePrefix);
  await assert.rejects(
    storage.deletePrefix({ prefix: "projects/project-1/" }),
    /remained after a successful delete response/
  );
  assert.deepEqual(
    commands.map((command) => (command as { constructor: unknown }).constructor),
    [ListObjectVersionsCommand, DeleteObjectsCommand, ListObjectVersionsCommand]
  );
});

test("S3 project prefix deletion rejects bucket-wide and unrelated prefixes", async () => {
  const commands: unknown[] = [];
  const storage = createS3ProjectAssetStorage({
    bucketName: "artifact-bucket",
    s3Client: {
      async send(command: unknown) {
        commands.push(command);
        return {};
      }
    } as unknown as S3Client
  });

  assert.ok(storage.deletePrefix);

  for (const prefix of [
    "projects/",
    "deployments/",
    "aws-connections/connection-1/",
    "projects/project-1/extra/"
  ]) {
    await assert.rejects(storage.deletePrefix({ prefix }), /deletion prefix is invalid/);
  }

  assert.deepEqual(commands, []);
});
