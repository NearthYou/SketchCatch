import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { passwordResetTokens, refreshTokens, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  createProfileUpdateToken,
  PROFILE_UPDATE_TOKEN_TTL_SECONDS,
  verifyProfileUpdateToken
} from "./tokens.js";

type UserRow = typeof users.$inferSelect;

export type ProfileUpdateFailure =
  | "password_change_not_supported"
  | "password_reused"
  | "verification_required"
  | "verification_expired";

export class ProfileUpdateError extends Error {
  constructor(readonly reason: ProfileUpdateFailure) {
    super(reason);
  }
}

export async function verifyProfilePassword(
  user: UserRow,
  currentPassword: string
): Promise<
  | { status: "social_account" }
  | { status: "invalid_password" }
  | { status: "verified"; verificationToken: string; expiresInSeconds: number }
> {
  if (!user.passwordHash) {
    return { status: "social_account" };
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { status: "invalid_password" };
  }

  return {
    status: "verified",
    verificationToken: await createProfileUpdateToken(
      user.id,
      user.updatedAt.toISOString()
    ),
    expiresInSeconds: PROFILE_UPDATE_TOKEN_TTL_SECONDS
  };
}

export async function updateProfile(input: {
  db: Database;
  user: UserRow;
  nickname: string;
  verificationToken?: string;
  newPassword?: string;
  now?: Date;
}): Promise<{ user: UserRow; passwordChanged: boolean }> {
  const { db, user } = input;
  const canChangePassword = user.passwordHash !== null;

  if (canChangePassword) {
    if (!input.verificationToken) {
      throw new ProfileUpdateError("verification_required");
    }

    const verification = await verifyProfileUpdateToken(input.verificationToken);
    if (
      !verification ||
      verification.userId !== user.id ||
      verification.credentialUpdatedAt !== user.updatedAt.toISOString()
    ) {
      throw new ProfileUpdateError("verification_expired");
    }
  } else if (input.newPassword) {
    throw new ProfileUpdateError("password_change_not_supported");
  }

  if (
    input.newPassword &&
    user.passwordHash &&
    (await verifyPassword(input.newPassword, user.passwordHash))
  ) {
    throw new ProfileUpdateError("password_reused");
  }

  const requestedNow = input.now ?? new Date();
  const now = new Date(
    Math.max(requestedNow.getTime(), user.updatedAt.getTime() + 1)
  );
  const nextPasswordHash = input.newPassword
    ? await hashPassword(input.newPassword)
    : undefined;

  const updatedUser = await db.transaction(async (tx) => {
    const [lockedUser] = await tx
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");

    if (
      !lockedUser ||
      lockedUser.updatedAt.getTime() !== user.updatedAt.getTime()
    ) {
      throw new ProfileUpdateError("verification_expired");
    }

    const [updated] = await tx
      .update(users)
      .set({
        nickname: input.nickname,
        updatedAt: now,
        ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {})
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      throw new ProfileUpdateError("verification_expired");
    }

    if (nextPasswordHash) {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt)
          )
        );
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    }

    return updated;
  });

  return {
    user: updatedUser,
    passwordChanged: nextPasswordHash !== undefined
  };
}
