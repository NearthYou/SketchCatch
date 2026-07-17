import assert from "node:assert/strict";
import { test } from "node:test";
import { claimProjectDraftTabCacheWorkspaceId } from "./project-draft-tab-cache";

function createSessionStorage(initialValues: ReadonlyMap<string, string> = new Map()) {
  const values = new Map(initialValues);

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
}

function createLockManager() {
  const heldLocks = new Set<string>();

  return {
    request: async <T>(
      name: string,
      _options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: unknown | null) => Promise<T> | T
    ): Promise<T> => {
      if (heldLocks.has(name)) {
        return callback(null);
      }

      heldLocks.add(name);

      try {
        return await callback({ name });
      } finally {
        heldLocks.delete(name);
      }
    }
  };
}

test("a tab keeps its exclusive local recovery key after refresh", async () => {
  const lockManager = createLockManager();
  const storage = createSessionStorage();
  const firstClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "tab-1",
    lockManager,
    sessionStorage: storage
  });
  firstClaim.release();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  const refreshedClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "unexpected-new-id",
    lockManager,
    sessionStorage: storage
  });

  assert.equal(firstClaim.workspaceId, "tab-1");
  assert.equal(refreshedClaim.workspaceId, "tab-1");
  refreshedClaim.release();
});

test("a duplicated tab cannot claim the copied local recovery key", async () => {
  const lockManager = createLockManager();
  const originalStorage = createSessionStorage();
  const originalClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "tab-1",
    lockManager,
    sessionStorage: originalStorage
  });
  const duplicatedStorage = createSessionStorage(originalStorage.values);
  const duplicateClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "tab-2",
    lockManager,
    sessionStorage: duplicatedStorage
  });

  assert.equal(originalClaim.workspaceId, "tab-1");
  assert.equal(duplicateClaim.workspaceId, "tab-2");
  originalClaim.release();
  duplicateClaim.release();
});

test("an explicit local cache or workspace id keeps its existing recovery scope", async () => {
  const explicitCacheClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "generated",
    localCacheWorkspaceId: "explicit-cache",
    workspaceId: "workspace"
  });
  const workspaceClaim = await claimProjectDraftTabCacheWorkspaceId({
    createId: () => "generated",
    workspaceId: "workspace"
  });

  assert.equal(explicitCacheClaim.workspaceId, "explicit-cache");
  assert.equal(workspaceClaim.workspaceId, "workspace");
});
