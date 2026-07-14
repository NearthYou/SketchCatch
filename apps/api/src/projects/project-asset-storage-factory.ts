import { getRuntimeEnv, type RuntimeEnv } from "../config/env.js";
import {
  createFilesystemProjectAssetStorage,
  type CreateFilesystemProjectAssetStorageOptions
} from "./filesystem-project-asset-storage.js";
import type { ProjectAssetStorage } from "./project-asset-storage.js";
import {
  createS3ProjectAssetStorage,
  type CreateS3ProjectAssetStorageOptions
} from "./s3-project-asset-storage.js";

type ProjectAssetStorageEnvironment = Pick<
  RuntimeEnv,
  "nodeEnv" | "projectAssetStorageBackend" | "projectAssetStorageRoot" | "s3BucketName"
>;

export type CreateProjectAssetStorageOptions = {
  env?: ProjectAssetStorageEnvironment;
  createFilesystemStorage?: (
    options: CreateFilesystemProjectAssetStorageOptions
  ) => ProjectAssetStorage;
  createS3Storage?: (
    options: Pick<CreateS3ProjectAssetStorageOptions, "bucketName">
  ) => ProjectAssetStorage;
};

export function createProjectAssetStorage(
  options: CreateProjectAssetStorageOptions = {}
): ProjectAssetStorage {
  const env = options.env ?? getRuntimeEnv();
  const configuredBackend = env.projectAssetStorageBackend?.trim().toLowerCase();
  const backend = configuredBackend || (env.nodeEnv === "production" ? "s3" : "filesystem");

  if (backend !== "filesystem" && backend !== "s3") {
    throw new Error("PROJECT_ASSET_STORAGE_BACKEND must be one of: filesystem, s3");
  }

  if (env.nodeEnv === "production" && backend === "filesystem") {
    throw new Error("Filesystem Project asset storage is not allowed in production");
  }

  if (backend === "s3") {
    const bucketName = env.s3BucketName?.trim();

    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME is required for S3 Project asset storage");
    }

    return (options.createS3Storage ?? createS3ProjectAssetStorage)({ bucketName });
  }

  const rootDirectory = env.projectAssetStorageRoot?.trim();
  return (options.createFilesystemStorage ?? createFilesystemProjectAssetStorage)(
    rootDirectory ? { rootDirectory } : {}
  );
}
