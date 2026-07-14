import assert from "node:assert/strict";
import { test } from "node:test";

type ProjectThumbnailLoadResult =
  | { readonly state: "cancelled" | "empty" | "error" }
  | { readonly blob: Blob; readonly state: "ready" };

type ThumbnailImageState = "empty" | "error" | "loading" | "ready";

type ProjectThumbnailImageLifecycle = {
  readonly apply: (result: ProjectThumbnailLoadResult) => void;
  readonly dispose: () => void;
};

type CreateProjectThumbnailImageLifecycle = (input: {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (objectUrl: string) => void;
  readonly setState: (state: ThumbnailImageState) => void;
  readonly setThumbnailUrl: (objectUrl: string | null) => void;
}) => ProjectThumbnailImageLifecycle;

async function getProjectThumbnailImageLifecycleFactory(): Promise<CreateProjectThumbnailImageLifecycle> {
  try {
    const module = await import("./project-thumbnail-image-lifecycle");
    return module.createProjectThumbnailImageLifecycle;
  } catch (error) {
    assert.fail(`Dashboard thumbnail image lifecycle must be available: ${String(error)}`);
  }
}

test("ignores a deferred old-project thumbnail after its card lifecycle is disposed", async () => {
  const createProjectThumbnailImageLifecycle = await getProjectThumbnailImageLifecycleFactory();
  const states: ThumbnailImageState[] = [];
  const objectUrls: Array<string | null> = [];
  const createdUrls: Blob[] = [];
  const revokedUrls: string[] = [];
  let resolveResult: ((result: ProjectThumbnailLoadResult) => void) | undefined;
  const pendingResult = new Promise<ProjectThumbnailLoadResult>((resolve) => {
    resolveResult = resolve;
  });
  const lifecycle = createProjectThumbnailImageLifecycle({
    createObjectUrl: (blob) => {
      createdUrls.push(blob);
      return "blob:old-project";
    },
    revokeObjectUrl: (objectUrl) => revokedUrls.push(objectUrl),
    setState: (state) => states.push(state),
    setThumbnailUrl: (objectUrl) => objectUrls.push(objectUrl)
  });

  void pendingResult.then(lifecycle.apply);
  lifecycle.dispose();
  resolveResult?.({ blob: new Blob(["old"], { type: "image/webp" }), state: "ready" });
  await pendingResult;
  await Promise.resolve();

  assert.deepEqual(states, []);
  assert.deepEqual(objectUrls, []);
  assert.deepEqual(createdUrls, []);
  assert.deepEqual(revokedUrls, []);
});

test("releases the created object URL when the active thumbnail card disposes", async () => {
  const createProjectThumbnailImageLifecycle = await getProjectThumbnailImageLifecycleFactory();
  const states: ThumbnailImageState[] = [];
  const objectUrls: Array<string | null> = [];
  const revokedUrls: string[] = [];
  const lifecycle = createProjectThumbnailImageLifecycle({
    createObjectUrl: () => "blob:active-project",
    revokeObjectUrl: (objectUrl) => revokedUrls.push(objectUrl),
    setState: (state) => states.push(state),
    setThumbnailUrl: (objectUrl) => objectUrls.push(objectUrl)
  });

  lifecycle.apply({ blob: new Blob(["active"], { type: "image/webp" }), state: "ready" });
  lifecycle.dispose();

  assert.deepEqual(states, ["ready"]);
  assert.deepEqual(objectUrls, ["blob:active-project"]);
  assert.deepEqual(revokedUrls, ["blob:active-project"]);
});
