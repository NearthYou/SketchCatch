import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { OAuthProvider } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { oauthAccounts, users } from "../db/schema.js";
import type { NormalizedOAuthProfile } from "./oauth-profile.js";
import type { PublicUserRow } from "./session.js";

export const OAUTH_EMAIL_REQUIRED = "email_required";
export const OAUTH_EMAIL_ALREADY_REGISTERED = "email_already_registered";
export const OAUTH_USER_DELETED = "user_deleted";
export const OAUTH_USER_LINK_FAILED = "user_link_failed";

const userForOAuthColumns = {
  createdAt: users.createdAt,
  deletedAt: users.deletedAt,
  email: users.email,
  id: users.id,
  nickname: users.nickname,
  username: users.username
};

type OAuthUserConnectionErrorCode =
  | typeof OAUTH_EMAIL_REQUIRED
  | typeof OAUTH_EMAIL_ALREADY_REGISTERED
  | typeof OAUTH_USER_DELETED
  | typeof OAUTH_USER_LINK_FAILED;

type UserForOAuthRow = PublicUserRow & {
  deletedAt: Date | null;
};

type OAuthUserLookupDb = Pick<Database, "select">;
type OAuthUserWriteDb = Pick<Database, "insert" | "select">;

export class OAuthUserConnectionError extends Error {
  constructor(
    readonly provider: OAuthProvider,
    readonly oauthError: OAuthUserConnectionErrorCode
  ) {
    super("OAuth user connection failed");
    this.name = "OAuthUserConnectionError";
  }
}

export async function findOrCreateOAuthUser(
  db: Database,
  profile: NormalizedOAuthProfile
): Promise<PublicUserRow> {
  try {
    const linkedUser = await findUserByOAuthAccount(db, profile);

    if (linkedUser) {
      return ensureActivePublicUser(linkedUser, profile.provider);
    }

    const emailResolution = resolveOAuthEmail(profile);

    return await db.transaction(async (tx) => {
      const existingEmailUser = emailResolution.shouldCheckExistingEmail
        ? await findUserByEmail(tx, emailResolution.email)
        : null;

      if (existingEmailUser) {
        if (!emailResolution.canLinkByEmail) {
          throw new OAuthUserConnectionError(profile.provider, OAUTH_EMAIL_ALREADY_REGISTERED);
        }

        const publicUser = ensureActivePublicUser(existingEmailUser, profile.provider);

        await createOAuthAccount(tx, publicUser.id, profile, emailResolution.email);

        return publicUser;
      }

      const createdUser = await createOAuthUser(tx, profile, emailResolution.email);

      await createOAuthAccount(tx, createdUser.id, profile, emailResolution.email);

      return createdUser;
    });
  } catch (error) {
    if (error instanceof OAuthUserConnectionError) {
      throw error;
    }

    throw new OAuthUserConnectionError(profile.provider, OAUTH_USER_LINK_FAILED);
  }
}

export function createSocialUsername(provider: OAuthProvider, providerUserId: string): string {
  const safeId = providerUserId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  const usernameSuffix = safeId.length > 0 ? safeId : "user";

  return `${provider}_${usernameSuffix}`.slice(0, 30).toLowerCase();
}

type OAuthEmailResolution = {
  canLinkByEmail: boolean;
  email: string;
  shouldCheckExistingEmail: boolean;
};

function resolveOAuthEmail(profile: NormalizedOAuthProfile): OAuthEmailResolution {
  if (profile.email && profile.emailVerified) {
    return {
      canLinkByEmail: canLinkExistingUserByEmail(profile.provider),
      email: profile.email,
      shouldCheckExistingEmail: true
    };
  }

  if (profile.provider === "kakao") {
    return {
      canLinkByEmail: false,
      email: createKakaoPlaceholderEmail(profile.providerUserId),
      shouldCheckExistingEmail: false
    };
  }

  if (!profile.email || !profile.emailVerified) {
    throw new OAuthUserConnectionError(profile.provider, OAUTH_EMAIL_REQUIRED);
  }

  return {
    canLinkByEmail: true,
    email: profile.email,
    shouldCheckExistingEmail: true
  };
}

function canLinkExistingUserByEmail(provider: OAuthProvider): boolean {
  return provider === "github";
}

function createKakaoPlaceholderEmail(providerUserId: string): string {
  const safeId = providerUserId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50);
  const suffix = safeId.length > 0 ? safeId : "user";

  return `kakao_${suffix.toLowerCase()}@oauth.local`;
}

async function findUserByOAuthAccount(
  db: OAuthUserLookupDb,
  profile: NormalizedOAuthProfile
): Promise<UserForOAuthRow | null> {
  const [oauthAccount] = await db
    .select({
      userId: oauthAccounts.userId
    })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    );

  if (!oauthAccount) {
    return null;
  }

  const [user] = await db
    .select(userForOAuthColumns)
    .from(users)
    .where(eq(users.id, oauthAccount.userId));

  if (!user) {
    throw new OAuthUserConnectionError(profile.provider, OAUTH_USER_LINK_FAILED);
  }

  return user;
}

async function findUserByEmail(
  db: OAuthUserLookupDb,
  email: string
): Promise<UserForOAuthRow | null> {
  const [user] = await db.select(userForOAuthColumns).from(users).where(eq(users.email, email));

  return user ?? null;
}

async function createOAuthUser(
  db: OAuthUserWriteDb,
  profile: NormalizedOAuthProfile,
  email: string
): Promise<PublicUserRow> {
  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      id: randomUUID(),
      nickname: createSocialNickname(profile),
      passwordHash: null,
      username: createSocialUsername(profile.provider, profile.providerUserId)
    })
    .returning(userForOAuthColumns);

  if (!createdUser) {
    throw new OAuthUserConnectionError(profile.provider, OAUTH_USER_LINK_FAILED);
  }

  return ensureActivePublicUser(createdUser, profile.provider);
}

async function createOAuthAccount(
  db: OAuthUserWriteDb,
  userId: string,
  profile: NormalizedOAuthProfile,
  email: string
): Promise<void> {
  await db.insert(oauthAccounts).values({
    displayName: profile.displayName,
    email,
    id: randomUUID(),
    profileImageUrl: profile.profileImageUrl,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    userId
  });
}

function createSocialNickname(profile: NormalizedOAuthProfile): string {
  const displayName = profile.displayName.trim();
  const nickname = displayName.length > 0 ? displayName : `${profile.provider} user`;

  return nickname.slice(0, 40);
}

function ensureActivePublicUser(user: UserForOAuthRow, provider: OAuthProvider): PublicUserRow {
  if (user.deletedAt) {
    throw new OAuthUserConnectionError(provider, OAUTH_USER_DELETED);
  }

  return {
    createdAt: user.createdAt,
    email: user.email,
    id: user.id,
    nickname: user.nickname,
    username: user.username
  };
}
