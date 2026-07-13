import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rmdir,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep, win32 } from "node:path";
import type { ProjectAssetStorage } from "./project-asset-storage.js";

const directoryMode = 0o700;
const fileMode = 0o600;

export type CreateFilesystemProjectAssetStorageOptions = {
  deleteFile?: typeof unlink;
  rootDirectory?: string;
};

export function createFilesystemProjectAssetStorage(
  options: CreateFilesystemProjectAssetStorageOptions = {}
): ProjectAssetStorage {
  const rootDirectory = resolve(
    process.cwd(),
    options.rootDirectory ?? ".local-data/project-assets"
  );
  const deleteFile = options.deleteFile ?? unlink;

  return {
    async putObject(input) {
      const object = resolveObject(rootDirectory, input.objectKey);
      await requireParentDirectories(object, true);
      await requireWritableFinalObject(object);

      const temporaryPath = join(
        dirname(object.absolutePath),
        `.project-asset-${randomUUID()}.tmp`
      );
      let temporaryFileCreated = false;

      try {
        const temporaryFile = await open(temporaryPath, "wx", fileMode);
        temporaryFileCreated = true;

        try {
          await temporaryFile.writeFile(input.body);
          await chmodFileWhereSupported(temporaryFile);
        } finally {
          await temporaryFile.close();
        }

        await requireParentDirectories(object, false);
        await requireWritableFinalObject(object);
        await rename(temporaryPath, object.absolutePath);
        temporaryFileCreated = false;
      } catch (error) {
        if (temporaryFileCreated) {
          try {
            await unlink(temporaryPath);
          } catch (cleanupError) {
            if (!isMissingError(cleanupError)) {
              throw operationError("clean up a failed write for", object.objectKey, cleanupError);
            }
          }
        }

        throw preserveStorageError(error, "write", object.objectKey);
      }
    },

    async getObject(input) {
      const object = resolveObject(rootDirectory, input.objectKey);
      const parentsExist = await requireParentDirectories(object, false);

      if (!parentsExist) {
        throw storageError(`Project asset object is missing: ${object.objectKey}`);
      }

      const objectStats = await getFinalObjectStats(object);

      if (!objectStats) {
        throw storageError(`Project asset object is missing: ${object.objectKey}`);
      }

      requireRegularFinalObject(object, objectStats);
      const openedObject = await openRegularObject(object);

      if (!openedObject) {
        throw storageError(`Project asset object is missing: ${object.objectKey}`);
      }

      try {
        return await openedObject.file.readFile();
      } catch (error) {
        throw operationError("read", object.objectKey, error);
      } finally {
        await closeFile(openedObject.file, object.objectKey);
      }
    },

    async deleteObject(input) {
      const object = resolveObject(rootDirectory, input.objectKey);
      const parentsExist = await requireParentDirectories(object, false);

      if (!parentsExist) {
        await pruneEmptyParentDirectories(object);
        return;
      }

      const objectStats = await getFinalObjectStats(object);

      if (!objectStats) {
        await pruneEmptyParentDirectories(object);
        return;
      }

      requireRegularFinalObject(object, objectStats);

      try {
        await deleteFile(object.absolutePath);
      } catch (error) {
        if (isMissingError(error)) {
          await pruneEmptyParentDirectories(object);
          return;
        }

        throw operationError("delete", object.objectKey, error);
      }

      await pruneEmptyParentDirectories(object);
    },

    async objectExists(input) {
      const object = resolveObject(rootDirectory, input.objectKey);
      const parentsExist = await requireParentDirectories(object, false);

      if (!parentsExist) {
        return false;
      }

      const objectStats = await getFinalObjectStats(object);

      if (!objectStats) {
        return false;
      }

      requireRegularFinalObject(object, objectStats);
      const openedObject = await openRegularObject(object);

      if (!openedObject) {
        return false;
      }

      try {
        return input.byteSize === null || openedObject.stats.size === input.byteSize;
      } finally {
        await closeFile(openedObject.file, object.objectKey);
      }
    }
  };
}

type ResolvedObject = {
  absolutePath: string;
  objectKey: string;
  rootDirectory: string;
  segments: string[];
};

function resolveObject(rootDirectory: string, objectKey: string): ResolvedObject {
  const segments = objectKey.split("/");

  if (
    objectKey.length === 0 ||
    objectKey.includes("\0") ||
    objectKey.includes("\\") ||
    isAbsolute(objectKey) ||
    win32.isAbsolute(objectKey) ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw storageError(`Invalid Project asset object key: ${JSON.stringify(objectKey)}`);
  }

  const absolutePath = resolve(rootDirectory, ...segments);
  const relativePath = relative(rootDirectory, absolutePath);

  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw storageError(`Invalid Project asset object key: ${JSON.stringify(objectKey)}`);
  }

  return { absolutePath, objectKey, rootDirectory, segments };
}

async function requireParentDirectories(
  object: ResolvedObject,
  createMissing: boolean
): Promise<boolean> {
  const rootExists = await requireRootDirectory(object, createMissing);

  if (!rootExists) {
    return false;
  }

  let currentDirectory = object.rootDirectory;

  for (const segment of object.segments.slice(0, -1)) {
    currentDirectory = join(currentDirectory, segment);
    let directoryStats = await getStats(currentDirectory, object.objectKey);

    if (!directoryStats && createMissing) {
      try {
        await mkdir(currentDirectory, { mode: directoryMode });
      } catch (error) {
        if (!hasErrorCode(error, "EEXIST")) {
          throw operationError("create a directory for", object.objectKey, error);
        }
      }

      directoryStats = await getStats(currentDirectory, object.objectKey);
    }

    if (!directoryStats) {
      return false;
    }

    requireRegularDirectory(object.objectKey, directoryStats);
    await chmodDirectoryWhereSupported(currentDirectory, object.objectKey);
  }

  await requireResolvedParentContainment(object);
  return true;
}

async function requireRootDirectory(
  object: ResolvedObject,
  createMissing: boolean
): Promise<boolean> {
  if (createMissing) {
    await createRootDirectoryWithoutSymlinks(object);
  }

  const rootStats = await getStats(object.rootDirectory, object.objectKey);

  if (!rootStats) {
    return false;
  }

  requireRegularDirectory(object.objectKey, rootStats);
  await requireRootDirectoryAncestry(object);
  await chmodDirectoryWhereSupported(object.rootDirectory, object.objectKey);
  return true;
}

async function requireRootDirectoryAncestry(object: ResolvedObject): Promise<void> {
  const filesystemRoot = parse(object.rootDirectory).root;
  const filesystemRootStats = await getStats(filesystemRoot, object.objectKey);

  if (!filesystemRootStats) {
    throw storageError(`Project asset filesystem root is missing: ${object.objectKey}`);
  }

  requireRegularDirectory(object.objectKey, filesystemRootStats);

  const relativeRoot = relative(filesystemRoot, object.rootDirectory);
  const rootSegments = relativeRoot.length === 0 ? [] : relativeRoot.split(sep);
  let currentDirectory = filesystemRoot;

  for (const segment of rootSegments) {
    currentDirectory = join(currentDirectory, segment);
    const directoryStats = await getStats(currentDirectory, object.objectKey);

    if (!directoryStats) {
      throw storageError(`Project asset storage root disappeared: ${object.objectKey}`);
    }

    requireRegularDirectory(object.objectKey, directoryStats);
  }
}

async function createRootDirectoryWithoutSymlinks(object: ResolvedObject): Promise<void> {
  const missingDirectories: string[] = [];
  let currentDirectory = object.rootDirectory;

  while (true) {
    const directoryStats = await getStats(currentDirectory, object.objectKey);

    if (directoryStats) {
      requireRegularDirectory(object.objectKey, directoryStats);
      break;
    }

    missingDirectories.push(currentDirectory);
    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw storageError(`Unable to find a safe Project asset storage root: ${object.objectKey}`);
    }

    currentDirectory = parentDirectory;
  }

  for (const directory of missingDirectories.reverse()) {
    try {
      await mkdir(directory, { mode: directoryMode });
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) {
        throw operationError("create the storage root for", object.objectKey, error);
      }
    }

    const directoryStats = await getStats(directory, object.objectKey);

    if (!directoryStats) {
      throw storageError(`Failed to create the Project asset storage root: ${object.objectKey}`);
    }

    requireRegularDirectory(object.objectKey, directoryStats);
    await chmodDirectoryWhereSupported(directory, object.objectKey);
  }
}

// Node has no portable descriptor-relative openat API. The 0700 root is treated as a trusted
// local boundary, and every operation immediately rechecks both lstat ancestry and real paths.
async function requireResolvedParentContainment(object: ResolvedObject): Promise<void> {
  try {
    const [resolvedRoot, resolvedParent] = await Promise.all([
      realpath(object.rootDirectory),
      realpath(dirname(object.absolutePath))
    ]);
    const relativeParent = relative(resolvedRoot, resolvedParent);

    if (
      relativeParent === ".." ||
      relativeParent.startsWith(`..${sep}`) ||
      isAbsolute(relativeParent)
    ) {
      throw storageError(`Project asset path escapes its storage root: ${object.objectKey}`);
    }
  } catch (error) {
    throw preserveStorageError(error, "verify storage containment for", object.objectKey);
  }
}

async function requireWritableFinalObject(object: ResolvedObject): Promise<void> {
  const objectStats = await getFinalObjectStats(object);

  if (objectStats) {
    requireRegularFinalObject(object, objectStats);
  }
}

async function getFinalObjectStats(object: ResolvedObject): Promise<Stats | undefined> {
  return getStats(object.absolutePath, object.objectKey);
}

async function openRegularObject(
  object: ResolvedObject
): Promise<{ file: FileHandle; stats: Stats } | undefined> {
  let file: FileHandle;

  try {
    file = await open(
      object.absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    );
  } catch (error) {
    if (isMissingError(error)) {
      return undefined;
    }

    if (hasErrorCode(error, "ELOOP")) {
      throw storageError(`Project asset object must not be a symlink: ${object.objectKey}`);
    }

    throw operationError("open", object.objectKey, error);
  }

  try {
    const stats = await file.stat();
    requireRegularFinalObject(object, stats);
    return { file, stats };
  } catch (error) {
    await closeFile(file, object.objectKey);
    throw preserveStorageError(error, "inspect", object.objectKey);
  }
}

async function closeFile(file: FileHandle, objectKey: string): Promise<void> {
  try {
    await file.close();
  } catch (error) {
    throw operationError("close", objectKey, error);
  }
}

async function getStats(path: string, objectKey: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissingError(error)) {
      return undefined;
    }

    throw operationError("inspect", objectKey, error);
  }
}

function requireRegularDirectory(objectKey: string, stats: Stats): void {
  if (stats.isSymbolicLink()) {
    throw storageError(`Project asset path contains a symlink: ${objectKey}`);
  }

  if (!stats.isDirectory()) {
    throw storageError(`Project asset path contains a non-directory parent: ${objectKey}`);
  }
}

function requireRegularFinalObject(object: ResolvedObject, stats: Stats): void {
  if (stats.isSymbolicLink()) {
    throw storageError(`Project asset object must not be a symlink: ${object.objectKey}`);
  }

  if (!stats.isFile()) {
    throw storageError(`Project asset object is not a regular file: ${object.objectKey}`);
  }
}

async function pruneEmptyParentDirectories(object: ResolvedObject): Promise<void> {
  let currentDirectory = dirname(object.absolutePath);

  while (currentDirectory !== object.rootDirectory) {
    const relativePath = relative(object.rootDirectory, currentDirectory);

    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw storageError(`Invalid Project asset object key: ${JSON.stringify(object.objectKey)}`);
    }

    const directoryStats = await getStats(currentDirectory, object.objectKey);

    if (!directoryStats) {
      currentDirectory = dirname(currentDirectory);
      continue;
    }

    requireRegularDirectory(object.objectKey, directoryStats);

    try {
      await rmdir(currentDirectory);
    } catch (error) {
      if (hasErrorCode(error, "ENOTEMPTY") || hasErrorCode(error, "EEXIST")) {
        return;
      }

      if (!isMissingError(error)) {
        throw operationError("prune empty directories for", object.objectKey, error);
      }
    }

    currentDirectory = dirname(currentDirectory);
  }
}

async function chmodDirectoryWhereSupported(path: string, objectKey: string): Promise<void> {
  try {
    await chmod(path, directoryMode);
  } catch (error) {
    if (!isUnsupportedChmodError(error)) {
      throw operationError("set directory permissions for", objectKey, error);
    }
  }
}

async function chmodFileWhereSupported(file: Awaited<ReturnType<typeof open>>): Promise<void> {
  try {
    await file.chmod(fileMode);
  } catch (error) {
    if (!isUnsupportedChmodError(error)) {
      throw error;
    }
  }
}

function isUnsupportedChmodError(error: unknown): boolean {
  return ["EINVAL", "ENOSYS", "ENOTSUP"].some((code) => hasErrorCode(error, code));
}

function isMissingError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

class ProjectAssetFilesystemError extends Error {}

function storageError(message: string): ProjectAssetFilesystemError {
  return new ProjectAssetFilesystemError(message);
}

function operationError(action: string, objectKey: string, cause: unknown): Error {
  return new ProjectAssetFilesystemError(`Failed to ${action} Project asset: ${objectKey}`, {
    cause
  });
}

function preserveStorageError(error: unknown, action: string, objectKey: string): Error {
  return error instanceof ProjectAssetFilesystemError
    ? error
    : operationError(action, objectKey, error);
}
