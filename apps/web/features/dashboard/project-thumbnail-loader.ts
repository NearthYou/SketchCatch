export type ProjectThumbnailLoadResult =
  | { readonly state: "cancelled" | "empty" | "error" }
  | { readonly blob: Blob; readonly state: "ready" };

type ProjectThumbnailLoaderInput = {
  readonly fetchThumbnail: (projectId: string) => Promise<Blob | null>;
  readonly isCancelled?: (() => boolean) | undefined;
  readonly maxAttempts?: number | undefined;
  readonly projectId: string;
  readonly retryDelayMs?: number | undefined;
  readonly shouldRetryError?: ((error: unknown) => boolean) | undefined;
  readonly wait?: ((delayMs: number) => Promise<void>) | undefined;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

// Dashboard가 upload/navigation 경합을 짧게 흡수하되, 지속 polling으로 남지 않게 합니다.
export async function loadProjectThumbnail({
  fetchThumbnail,
  isCancelled = () => false,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  projectId,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  shouldRetryError = isRetryableProjectThumbnailError,
  wait = waitForProjectThumbnailRetry
}: ProjectThumbnailLoaderInput): Promise<ProjectThumbnailLoadResult> {
  const attemptCount = Math.max(1, Math.floor(maxAttempts));
  const delayMs = Math.max(0, retryDelayMs);
  let finalState: "empty" | "error" = "empty";

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    if (isCancelled()) {
      return { state: "cancelled" };
    }

    try {
      const blob = await fetchThumbnail(projectId);

      if (isCancelled()) {
        return { state: "cancelled" };
      }

      if (blob) {
        return { blob, state: "ready" };
      }

      finalState = "empty";
    } catch (error) {
      if (isCancelled()) {
        return { state: "cancelled" };
      }

      finalState = "error";

      if (!shouldRetryError(error)) {
        break;
      }
    }

    if (attempt + 1 < attemptCount) {
      await wait(delayMs);

      if (isCancelled()) {
        return { state: "cancelled" };
      }
    }
  }

  return { state: finalState };
}

function isRetryableProjectThumbnailError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }

  const status = (error as { readonly status: unknown }).status;

  return typeof status !== "number" || status === 0 || status === 408 || status === 429 || status >= 500;
}

function waitForProjectThumbnailRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}
