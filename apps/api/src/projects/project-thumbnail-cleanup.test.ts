import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanupSupersededProjectThumbnails } from "./project-thumbnail-cleanup.js";

test("thumbnail cleanup keeps the canonical newest capture and removes every superseded upload", async () => {
  const deletedObjects: string[] = [];
  const deletedRows: string[] = [];

  await cleanupSupersededProjectThumbnails({
    listUploaded: async () => [
      { createdAt: new Date("2026-07-13T01:00:00.000Z"), id: "old-1", objectKey: "old-1.webp" },
      { createdAt: new Date("2026-07-13T02:00:00.000Z"), id: "old-2", objectKey: "old-2.webp" },
      { createdAt: new Date("2026-07-13T03:00:00.000Z"), id: "current", objectKey: "current.webp" },
      { createdAt: new Date("2026-07-13T04:00:00.000Z"), id: "newer", objectKey: "newer.webp" }
    ],
    deleteObject: async (objectKey) => {
      deletedObjects.push(objectKey);
    },
    deleteRow: async (assetId) => {
      deletedRows.push(assetId);
    }
  });

  assert.deepEqual(deletedObjects, ["current.webp", "old-2.webp", "old-1.webp"]);
  assert.deepEqual(deletedRows, ["current", "old-2", "old-1"]);
});

test("thumbnail cleanup breaks equal-time ties by id so reverse completion cannot leak duplicates", async () => {
  const deletedRows: string[] = [];

  await cleanupSupersededProjectThumbnails({
    listUploaded: async () => [
      { createdAt: new Date("2026-07-13T04:00:00.000Z"), id: "capture-a", objectKey: "a.webp" },
      { createdAt: new Date("2026-07-13T04:00:00.000Z"), id: "capture-b", objectKey: "b.webp" }
    ],
    deleteObject: async () => undefined,
    deleteRow: async (assetId) => {
      deletedRows.push(assetId);
    }
  });

  assert.deepEqual(deletedRows, ["capture-a"]);
});

test("thumbnail cleanup keeps metadata when deleting its object fails", async () => {
  const deletedRows: string[] = [];
  const errors: unknown[] = [];

  await cleanupSupersededProjectThumbnails({
    listUploaded: async () => [
      { createdAt: new Date("2026-07-13T01:00:00.000Z"), id: "old", objectKey: "old.webp" },
      { createdAt: new Date("2026-07-13T02:00:00.000Z"), id: "new", objectKey: "new.webp" }
    ],
    deleteObject: async () => {
      throw new Error("S3 unavailable");
    },
    deleteRow: async (assetId) => {
      deletedRows.push(assetId);
    },
    onDeleteError: (error) => errors.push(error)
  });

  assert.deepEqual(deletedRows, []);
  assert.equal(errors.length, 1);
});
