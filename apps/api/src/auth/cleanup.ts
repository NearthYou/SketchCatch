import { and, isNotNull, lt, or } from "drizzle-orm";
import type { Database, DatabaseClient } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export const REVOKED_REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type RefreshTokenCleanupCandidate = {
  expiresAt: Date;
  revokedAt: Date | null;
};

type RefreshTokenCleanupJobOptions = {
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export async function deleteStaleRefreshTokens(db: Database, now = new Date()): Promise<void> {
  await db.delete(refreshTokens).where(
    or(
      lt(refreshTokens.expiresAt, now),
      and(
        isNotNull(refreshTokens.revokedAt),
        lt(refreshTokens.revokedAt, getRevokedRefreshTokenRetentionCutoff(now))
      )
    )
  );
}

export function startRefreshTokenCleanupJob(
  getDatabaseClient: () => Pick<DatabaseClient, "db">,
  options: RefreshTokenCleanupJobOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? REFRESH_TOKEN_CLEANUP_INTERVAL_MS;
  let isCleanupRunning = false;

  const runCleanup = async (): Promise<void> => {
    if (isCleanupRunning) {
      return;
    }

    isCleanupRunning = true;

    try {
      const { db } = getDatabaseClient();
      await deleteStaleRefreshTokens(db);
    } finally {
      isCleanupRunning = false;
    }
  };

  const timer = setInterval(() => {
    void runCleanup().catch((error: unknown) => {
      options.onError?.(error);
    });
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
}

export function shouldDeleteRefreshToken(
  token: RefreshTokenCleanupCandidate,
  now = new Date()
): boolean {
  if (token.expiresAt.getTime() < now.getTime()) {
    return true;
  }

  if (!token.revokedAt) {
    return false;
  }

  return token.revokedAt.getTime() < getRevokedRefreshTokenRetentionCutoff(now).getTime();
}

export function getRevokedRefreshTokenRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - REVOKED_REFRESH_TOKEN_RETENTION_MS);
}
