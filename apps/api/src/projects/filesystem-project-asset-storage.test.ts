import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { createFilesystemProjectAssetStorage } from "./filesystem-project-asset-storage.js";

test("filesystem storage round-trips binary buffers and UTF-8 strings", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const binaryBody = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47]);
  const stringBody = "SketchCatch 프로젝트 캡처";

  await storage.putObject({
    objectKey: "projects/binary/capture.webp",
    contentType: "image/webp",
    body: binaryBody
  });
  await storage.putObject({
    objectKey: "projects/text/main.tf",
    contentType: "text/plain; charset=utf-8",
    body: stringBody
  });

  assert.deepEqual(
    await storage.getObject({ objectKey: "projects/binary/capture.webp" }),
    binaryBody
  );
  assert.deepEqual(
    await storage.getObject({ objectKey: "projects/text/main.tf" }),
    Buffer.from(stringBody, "utf8")
  );

  if (process.platform !== "win32") {
    assert.equal((await stat(rootDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(rootDirectory, "projects"))).mode & 0o777, 0o700);
    assert.equal(
      (await stat(join(rootDirectory, "projects/binary/capture.webp"))).mode & 0o777,
      0o600
    );
  }
});

test("filesystem storage checks exact object size and reports missing objects", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const body = Buffer.from("exact-size", "utf8");

  await storage.putObject({
    objectKey: "projects/size/object.bin",
    contentType: "application/octet-stream",
    body
  });

  assert.equal(
    await storage.objectExists({ objectKey: "projects/size/object.bin", byteSize: null }),
    true
  );
  assert.equal(
    await storage.objectExists({
      objectKey: "projects/size/object.bin",
      byteSize: body.byteLength
    }),
    true
  );
  assert.equal(
    await storage.objectExists({
      objectKey: "projects/size/object.bin",
      byteSize: body.byteLength + 1
    }),
    false
  );
  assert.equal(
    await storage.objectExists({ objectKey: "projects/size/missing.bin", byteSize: null }),
    false
  );
  await assert.rejects(storage.getObject({ objectKey: "projects/size/missing.bin" }), /missing/i);
});

test("filesystem delete is idempotent and prunes empty parents without deleting the root", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const objectKey = "projects/project-id/assets/thumbnail/capture.webp";

  await storage.putObject({ objectKey, contentType: "image/webp", body: "capture" });
  await storage.deleteObject({ objectKey: "projects/project-id/assets/missing.webp" });
  await storage.deleteObject({ objectKey });
  await storage.deleteObject({ objectKey });

  await assert.rejects(lstat(join(rootDirectory, "projects")), hasCode("ENOENT"));
  assert.equal((await stat(rootDirectory)).isDirectory(), true);
});

test("filesystem delete prunes empty parents when the final object is already missing", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const objectKey = "projects/project-id/assets/missing-before-delete.webp";

  await storage.putObject({ objectKey, contentType: "image/webp", body: "capture" });
  await unlink(join(rootDirectory, objectKey));
  await storage.deleteObject({ objectKey });

  await assert.rejects(lstat(join(rootDirectory, "projects")), hasCode("ENOENT"));
  assert.equal((await stat(rootDirectory)).isDirectory(), true);
});

test("filesystem delete prunes empty parents when the object disappears during unlink", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  let deleteFileCalls = 0;
  const storageOptions = {
    rootDirectory,
    async deleteFile(path: Parameters<typeof unlink>[0]) {
      deleteFileCalls += 1;
      await unlink(path);
      await unlink(path);
    }
  };
  const storage = createFilesystemProjectAssetStorage(storageOptions);
  const objectKey = "projects/project-id/assets/disappears-during-delete.webp";

  await storage.putObject({ objectKey, contentType: "image/webp", body: "capture" });
  await storage.deleteObject({ objectKey });

  assert.equal(deleteFileCalls, 1);
  await assert.rejects(lstat(join(rootDirectory, "projects")), hasCode("ENOENT"));
  assert.equal((await stat(rootDirectory)).isDirectory(), true);
});

test("filesystem storage rejects unsafe object keys for every operation", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const unsafeKeys = [
    "",
    "/absolute/object",
    "C:/absolute/object",
    "projects\\escaped\\object",
    "projects/with\0nul",
    ".",
    "..",
    "projects/./object",
    "projects/../object"
  ];

  for (const objectKey of unsafeKeys) {
    await assert.rejects(
      storage.putObject({ objectKey, contentType: "text/plain", body: "unsafe" }),
      /invalid project asset object key/i
    );
    await assert.rejects(storage.getObject({ objectKey }), /invalid project asset object key/i);
    await assert.rejects(
      storage.objectExists({ objectKey, byteSize: null }),
      /invalid project asset object key/i
    );
    await assert.rejects(storage.deleteObject({ objectKey }), /invalid project asset object key/i);
  }
});

test("filesystem storage rejects symlink parents and final objects", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const outsideDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const outsideFile = join(outsideDirectory, "outside.txt");

  await mkdir(rootDirectory, { recursive: true });
  await writeFile(outsideFile, "outside", "utf8");
  await symlink(outsideDirectory, join(rootDirectory, "linked-parent"), "dir");
  await symlink(outsideFile, join(rootDirectory, "linked-object"), "file");

  await assert.rejects(
    storage.putObject({
      objectKey: "linked-parent/escaped.txt",
      contentType: "text/plain",
      body: "changed"
    }),
    /symlink/i
  );

  for (const operation of [
    () =>
      storage.putObject({
        objectKey: "linked-object",
        contentType: "text/plain",
        body: "changed"
      }),
    () => storage.getObject({ objectKey: "linked-object" }),
    () => storage.objectExists({ objectKey: "linked-object", byteSize: null }),
    () => storage.deleteObject({ objectKey: "linked-object" })
  ]) {
    await assert.rejects(operation(), /symlink/i);
  }

  assert.equal(await readFile(outsideFile, "utf8"), "outside");
});

test("filesystem storage rejects a symlinked intermediate while creating its root", async (t) => {
  const rootParent = await createTemporaryRoot(t);
  const outsideDirectory = await createTemporaryRoot(t);
  const linkedIntermediate = join(rootParent, ".local-data");
  const storage = createFilesystemProjectAssetStorage({
    rootDirectory: join(linkedIntermediate, "project-assets")
  });

  await symlink(outsideDirectory, linkedIntermediate, "dir");

  await assert.rejects(
    storage.putObject({
      objectKey: "projects/project-id/capture.webp",
      contentType: "image/webp",
      body: "capture"
    }),
    /symlink/i
  );
  assert.deepEqual(await readdir(outsideDirectory), []);
});

test("filesystem storage rejects a symlinked root ancestor when the full root already exists", async (t) => {
  const rootParent = await createTemporaryRoot(t);
  const outsideDirectory = await createTemporaryRoot(t);
  const outsideRoot = join(outsideDirectory, "project-assets");
  const linkedIntermediate = join(rootParent, ".local-data");
  const storage = createFilesystemProjectAssetStorage({
    rootDirectory: join(linkedIntermediate, "project-assets")
  });

  await mkdir(outsideRoot, { mode: 0o700 });
  await symlink(outsideDirectory, linkedIntermediate, "dir");

  await assert.rejects(
    storage.putObject({
      objectKey: "projects/project-id/capture.webp",
      contentType: "image/webp",
      body: "capture"
    }),
    /symlink/i
  );
  assert.deepEqual(await readdir(outsideRoot), []);
});

test("filesystem storage removes its exclusive temporary file when a write fails", async (t) => {
  const rootDirectory = await createTemporaryRoot(t);
  const storage = createFilesystemProjectAssetStorage({ rootDirectory });
  const objectKey = "projects/project-id/failing-object.bin";

  await assert.rejects(
    storage.putObject({
      objectKey,
      contentType: "application/octet-stream",
      body: undefined as unknown as Buffer
    })
  );

  const parentDirectory = join(rootDirectory, dirname(objectKey));
  assert.deepEqual(await readdir(parentDirectory), []);
});

async function createTemporaryRoot(t: TestContext): Promise<string> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sketchcatch-project-assets-"));
  const rootDirectory = await realpath(temporaryDirectory);
  t.after(async () => rm(rootDirectory, { force: true, recursive: true }));
  return rootDirectory;
}

function hasCode(expectedCode: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === expectedCode;
}
