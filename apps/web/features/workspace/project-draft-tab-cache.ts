import { createWorkspaceId } from "./project-draft-persistence";

const PROJECT_DRAFT_TAB_CACHE_ID = "sketchcatch:project-draft:tab-cache-workspace-id";
const PROJECT_DRAFT_TAB_CACHE_LOCK_PREFIX = "sketchcatch:project-draft:tab-cache:";
const STORED_LOCK_RETRY_DELAY_MS = 150;

type ProjectDraftTabSessionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type ProjectDraftTabLockManager = {
  request<T>(
    name: string,
    options: { ifAvailable: true; mode: "exclusive" },
    callback: (lock: unknown | null) => Promise<T> | T
  ): Promise<T>;
};

export type ProjectDraftTabCacheClaim = {
  release(): void;
  workspaceId: string;
};

type LockAttempt =
  | { status: "acquired"; claim: ProjectDraftTabCacheClaim }
  | { status: "unavailable" }
  | { status: "unsupported" };

export async function claimProjectDraftTabCacheWorkspaceId({
  createId = createWorkspaceId,
  localCacheWorkspaceId,
  lockManager = getLockManager(),
  sessionStorage = getSessionStorage(),
  waitForStoredLockRelease = waitForStoredLockReleaseRetry,
  workspaceId
}: {
  createId?: (() => string) | undefined;
  localCacheWorkspaceId?: string | undefined;
  lockManager?: ProjectDraftTabLockManager | null | undefined;
  sessionStorage?: ProjectDraftTabSessionStorage | null | undefined;
  waitForStoredLockRelease?: (() => Promise<void>) | undefined;
  workspaceId?: string | undefined;
}): Promise<ProjectDraftTabCacheClaim> {
  const explicitWorkspaceId = localCacheWorkspaceId ?? workspaceId;

  if (explicitWorkspaceId) {
    return createClaim(explicitWorkspaceId);
  }

  const storedWorkspaceId = readStoredWorkspaceId(sessionStorage);

  if (storedWorkspaceId) {
    const storedClaim = await tryAcquireWorkspaceLock(lockManager, storedWorkspaceId);

    if (storedClaim.status === "acquired") {
      return storedClaim.claim;
    }

    if (storedClaim.status === "unsupported") {
      const fallbackWorkspaceId = createId();
      storeWorkspaceId(sessionStorage, fallbackWorkspaceId);
      return createClaim(fallbackWorkspaceId);
    }

    await waitForStoredLockRelease();
    const retriedStoredClaim = await tryAcquireWorkspaceLock(lockManager, storedWorkspaceId);

    if (retriedStoredClaim.status === "acquired") {
      return retriedStoredClaim.claim;
    }
  }

  while (true) {
    const generatedWorkspaceId = createId();
    const generatedClaim = await tryAcquireWorkspaceLock(lockManager, generatedWorkspaceId);

    if (generatedClaim.status === "unavailable") {
      continue;
    }

    storeWorkspaceId(sessionStorage, generatedWorkspaceId);
    return generatedClaim.status === "acquired"
      ? generatedClaim.claim
      : createClaim(generatedWorkspaceId);
  }
}

function tryAcquireWorkspaceLock(
  lockManager: ProjectDraftTabLockManager | null,
  workspaceId: string
): Promise<LockAttempt> {
  if (!lockManager) {
    return Promise.resolve({ status: "unsupported" });
  }

  return new Promise((resolve) => {
    let settled = false;

    void lockManager
      .request(
        `${PROJECT_DRAFT_TAB_CACHE_LOCK_PREFIX}${workspaceId}`,
        { ifAvailable: true, mode: "exclusive" },
        async (lock) => {
          if (!lock) {
            settled = true;
            resolve({ status: "unavailable" });
            return;
          }

          let releaseLock: () => void = () => undefined;
          const released = new Promise<void>((release) => {
            releaseLock = release;
          });
          settled = true;
          resolve({
            status: "acquired",
            claim: {
              workspaceId,
              release: releaseLock
            }
          });
          await released;
        }
      )
      .catch(() => {
        if (!settled) {
          resolve({ status: "unsupported" });
        }
      });
  });
}

function createClaim(workspaceId: string): ProjectDraftTabCacheClaim {
  return {
    workspaceId,
    release: () => undefined
  };
}

function readStoredWorkspaceId(storage: ProjectDraftTabSessionStorage | null): string | null {
  try {
    return storage?.getItem(PROJECT_DRAFT_TAB_CACHE_ID) ?? null;
  } catch {
    return null;
  }
}

function storeWorkspaceId(
  storage: ProjectDraftTabSessionStorage | null,
  workspaceId: string
): void {
  try {
    storage?.setItem(PROJECT_DRAFT_TAB_CACHE_ID, workspaceId);
  } catch {
    // IndexedDB recovery still works for the current page when session storage is unavailable.
  }
}

function getLockManager(): ProjectDraftTabLockManager | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return null;
  }

  return navigator.locks;
}

function getSessionStorage(): ProjectDraftTabSessionStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function waitForStoredLockReleaseRetry(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, STORED_LOCK_RETRY_DELAY_MS);
  });
}
