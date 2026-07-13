import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectAssetUploadResponse } from "../../../../packages/types/src";

import { createProjectBoardThumbnailCaptureService } from "./project-board-thumbnail";

const projectId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

test("project Board thumbnail captures the real marked canvas and uploads it as a thumbnail asset", async () => {
  const captureElement = {} as HTMLElement;
  const capture = new Blob(["captured-board"], { type: "image/webp" });
  const calls: string[] = [];
  const service = createProjectBoardThumbnailCaptureService({
    findCaptureElement: () => assert.fail("an exact Board element must not use the fallback selector"),
    captureElement: async (element) => {
      assert.equal(element, captureElement);
      calls.push("capture");
      return capture;
    },
    createProjectAssetUpload: async (request) => {
      calls.push("create");
      assert.deepEqual(request, {
        assetType: "thumbnail",
        byteSize: capture.size,
        contentType: "image/webp",
        fileName: "architecture-board.webp",
        projectId
      });
      return createUploadResponse();
    },
    uploadProjectAsset: async (upload, content) => {
      calls.push("upload");
      assert.equal(upload.url, `/api/projects/${projectId}/assets/${assetId}/upload-content`);
      assert.equal(content, capture);
    },
    confirmProjectAssetUpload: async ({ assetId: confirmedAssetId, projectId: confirmedProjectId }) => {
      calls.push("confirm");
      assert.equal(confirmedAssetId, assetId);
      assert.equal(confirmedProjectId, projectId);
      return createUploadResponse().asset;
    },
    abortProjectAssetUpload: async () => {
      assert.fail("successful capture must not abort");
    }
  });

  const result = await service.captureAndUpload({ projectId, element: captureElement });

  assert.deepEqual(result, { status: "uploaded", assetId });
  assert.deepEqual(calls, ["capture", "create", "upload", "confirm"]);
});

test("project Board thumbnail skips a disconnected exact Board element", async () => {
  const disconnectedElement = { isConnected: false } as HTMLElement;
  const service = createProjectBoardThumbnailCaptureService({
    findCaptureElement: () => assert.fail("an exact Board element must not use the fallback selector"),
    captureElement: async () => assert.fail("a disconnected Board must not be captured"),
    createProjectAssetUpload: async () => assert.fail("asset creation should not run"),
    uploadProjectAsset: async () => assert.fail("upload should not run"),
    confirmProjectAssetUpload: async () => assert.fail("confirmation should not run"),
    abortProjectAssetUpload: async () => assert.fail("abort should not run")
  });

  assert.deepEqual(
    await service.captureAndUpload({ projectId, element: disconnectedElement }),
    { status: "skipped" }
  );
});

test("project Board thumbnail skips upload when the real Board DOM is unavailable", async () => {
  const service = createProjectBoardThumbnailCaptureService({
    findCaptureElement: () => null,
    captureElement: async () => assert.fail("capture should not run"),
    createProjectAssetUpload: async () => assert.fail("asset creation should not run"),
    uploadProjectAsset: async () => assert.fail("upload should not run"),
    confirmProjectAssetUpload: async () => assert.fail("confirmation should not run"),
    abortProjectAssetUpload: async () => assert.fail("abort should not run")
  });

  assert.deepEqual(await service.captureAndUpload({ projectId }), { status: "skipped" });
});

test("project Board thumbnail aborts pending metadata when upload fails", async () => {
  const captureElement = {} as HTMLElement;
  const aborted: Array<{ assetId: string; projectId: string }> = [];
  const service = createProjectBoardThumbnailCaptureService({
    findCaptureElement: () => assert.fail("an exact Board element must not use the fallback selector"),
    captureElement: async () => new Blob(["capture"], { type: "image/webp" }),
    createProjectAssetUpload: async () => createUploadResponse(),
    uploadProjectAsset: async () => {
      throw new Error("upload failed");
    },
    confirmProjectAssetUpload: async () => assert.fail("confirmation should not run"),
    abortProjectAssetUpload: async (request) => {
      aborted.push(request);
    }
  });

  await assert.rejects(
    service.captureAndUpload({ projectId, element: captureElement }),
    /upload failed/
  );
  assert.deepEqual(aborted, [{ assetId, projectId }]);
});

test("project Board thumbnail serializes only the latest exact element behind an in-flight capture", async () => {
  const firstElement = { id: "first" } as unknown as HTMLElement;
  const staleElement = { id: "stale" } as unknown as HTMLElement;
  const latestElement = { id: "latest" } as unknown as HTMLElement;
  const capturedElements: HTMLElement[] = [];
  let captureCount = 0;
  let activeCaptureCount = 0;
  let maxActiveCaptureCount = 0;
  let createCount = 0;
  let releaseCapture: (() => void) | undefined;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const service = createProjectBoardThumbnailCaptureService({
    findCaptureElement: () => assert.fail("exact Board elements must not use the fallback selector"),
    captureElement: async (element) => {
      capturedElements.push(element);
      captureCount += 1;
      activeCaptureCount += 1;
      maxActiveCaptureCount = Math.max(maxActiveCaptureCount, activeCaptureCount);

      if (captureCount === 1) {
        await captureGate;
      }

      activeCaptureCount -= 1;
      return new Blob([`capture-${captureCount}`], { type: "image/webp" });
    },
    createProjectAssetUpload: async () => {
      createCount += 1;
      return createUploadResponse();
    },
    uploadProjectAsset: async () => undefined,
    confirmProjectAssetUpload: async () => createUploadResponse().asset,
    abortProjectAssetUpload: async () => assert.fail("successful capture must not abort")
  });

  const first = service.captureAndUpload({ projectId, element: firstElement });
  await Promise.resolve();
  const second = service.captureAndUpload({ projectId, element: staleElement });
  const third = service.captureAndUpload({ projectId, element: latestElement });
  releaseCapture?.();

  assert.deepEqual(await Promise.all([first, second, third]), [
    { status: "uploaded", assetId },
    { status: "uploaded", assetId },
    { status: "uploaded", assetId }
  ]);
  assert.equal(captureCount, 2);
  assert.equal(createCount, 2);
  assert.equal(maxActiveCaptureCount, 1);
  assert.deepEqual(capturedElements, [firstElement, latestElement]);
});

function createUploadResponse(): ProjectAssetUploadResponse {
  return {
    asset: {
      id: assetId,
      projectId,
      architectureId: null,
      assetType: "thumbnail",
      objectKey: `projects/${projectId}/assets/thumbnail/${assetId}-architecture-board.webp`,
      fileName: "architecture-board.webp",
      contentType: "image/webp",
      byteSize: 13,
      uploadStatus: "pending",
      createdAt: "2026-07-13T00:00:00.000Z"
    },
    upload: {
      method: "PUT",
      url: `/api/projects/${projectId}/assets/${assetId}/upload-content`,
      headers: { "Content-Type": "image/webp" },
      expiresInSeconds: 900
    }
  };
}
