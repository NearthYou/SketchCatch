import { and, isNotNull, lt, or } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export const REVOKED_REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type RefreshTokenCleanupCandidate = {
  expiresAt: Date;
  revokedAt: Date | null;
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
