import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAssetStorage } from "./project-asset-storage.js";
import { createProjectAssetStorage } from "./project-asset-storage-factory.js";

test("development and test default to filesystem without creating an S3 adapter", () => {
  for (const nodeEnv of ["development", "test"]) {
    const filesystemStorage = createStorageStub();
    let filesystemOptions: { rootDirectory?: string } | undefined;
    let s3FactoryCalls = 0;

    const storage = createProjectAssetStorage({
      env: {
        nodeEnv,
        projectAssetStorageBackend: undefined,
        projectAssetStorageRoot: "relative/project-assets",
        s3BucketName: undefined
      },
      createFilesystemStorage(options) {
        filesystemOptions = options;
        return filesystemStorage;
      },
      createS3Storage() {
        s3FactoryCalls += 1;
        return createStorageStub();
      }
    });

    assert.equal(storage, filesystemStorage);
    assert.deepEqual(filesystemOptions, { rootDirectory: "relative/project-assets" });
    assert.equal(s3FactoryCalls, 0);
  }
});

test("development may explicitly select S3 with a bucket", () => {
  const s3Storage = createStorageStub();
  const s3Buckets: string[] = [];

  const storage = createProjectAssetStorage({
    env: {
      nodeEnv: "development",
      projectAssetStorageBackend: "s3",
      projectAssetStorageRoot: undefined,
      s3BucketName: "dev-project-assets"
    },
    createFilesystemStorage() {
      throw new Error("filesystem factory must stay unused");
    },
    createS3Storage(options) {
      s3Buckets.push(options.bucketName);
      return s3Storage;
    }
  });

  assert.equal(storage, s3Storage);
  assert.deepEqual(s3Buckets, ["dev-project-assets"]);
});

test("production defaults to S3 and captures the configured bucket", () => {
  const s3Storage = createStorageStub();

  const storage = createProjectAssetStorage({
    env: {
      nodeEnv: "production",
      projectAssetStorageBackend: undefined,
      projectAssetStorageRoot: undefined,
      s3BucketName: "production-project-assets"
    },
    createFilesystemStorage() {
      throw new Error("production must not construct filesystem storage");
    },
    createS3Storage(options) {
      assert.equal(options.bucketName, "production-project-assets");
      return s3Storage;
    }
  });

  assert.equal(storage, s3Storage);
});

test("S3 selection rejects a missing bucket before constructing an S3 adapter", () => {
  for (const env of [
    {
      nodeEnv: "development",
      projectAssetStorageBackend: "s3",
      projectAssetStorageRoot: undefined,
      s3BucketName: undefined
    },
    {
      nodeEnv: "production",
      projectAssetStorageBackend: undefined,
      projectAssetStorageRoot: undefined,
      s3BucketName: "  "
    }
  ]) {
    let s3FactoryCalls = 0;

    assert.throws(
      () =>
        createProjectAssetStorage({
          env,
          createFilesystemStorage: () => createStorageStub(),
          createS3Storage: () => {
            s3FactoryCalls += 1;
            return createStorageStub();
          }
        }),
      /S3_BUCKET_NAME is required/
    );
    assert.equal(s3FactoryCalls, 0);
  }
});

test("factory rejects invalid backends without constructing either adapter", () => {
  let factoryCalls = 0;

  assert.throws(
    () =>
      createProjectAssetStorage({
        env: {
          nodeEnv: "development",
          projectAssetStorageBackend: "memory",
          projectAssetStorageRoot: undefined,
          s3BucketName: undefined
        },
        createFilesystemStorage: () => {
          factoryCalls += 1;
          return createStorageStub();
        },
        createS3Storage: () => {
          factoryCalls += 1;
          return createStorageStub();
        }
      }),
    /PROJECT_ASSET_STORAGE_BACKEND must be one of: filesystem, s3/
  );
  assert.equal(factoryCalls, 0);
});

test("production rejects an explicit filesystem backend without constructing it", () => {
  let factoryCalls = 0;

  assert.throws(
    () =>
      createProjectAssetStorage({
        env: {
          nodeEnv: "production",
          projectAssetStorageBackend: "filesystem",
          projectAssetStorageRoot: undefined,
          s3BucketName: "production-project-assets"
        },
        createFilesystemStorage: () => {
          factoryCalls += 1;
          return createStorageStub();
        },
        createS3Storage: () => {
          factoryCalls += 1;
          return createStorageStub();
        }
      }),
    /filesystem project asset storage is not allowed in production/i
  );
  assert.equal(factoryCalls, 0);
});

function createStorageStub(): ProjectAssetStorage {
  return {
    async putObject() {},
    async getObject() {
      return Buffer.alloc(0);
    },
    async deleteObject() {},
    async objectExists() {
      return false;
    }
  };
}
