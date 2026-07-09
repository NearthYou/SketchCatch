import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../db/client.js";
import { oauthAccounts, users } from "../db/schema.js";
import type { NormalizedOAuthProfile } from "./oauth-profile.js";
import {
  createSocialUsername,
  findOrCreateOAuthUser,
  OAUTH_EMAIL_REQUIRED,
  OAUTH_USER_DELETED,
  OAUTH_USER_LINK_FAILED,
  OAuthUserConnectionError
} from "./oauth-users.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserRow = typeof users.$inferSelect;
type InsertedRow = Record<string, unknown>;

test("findOrCreateOAuthUser returns the already linked active user", async () => {
  const linkedUser = makeUser({
    id: "linked-user-id",
    username: "linked_user"
  });
  const fakeDb = new FakeOAuthDb([[{ userId: linkedUser.id }], [linkedUser]]);

  const result = await findOrCreateOAuthUser(fakeDb.db, makeProfile());

  assert.deepEqual(result, {
    createdAt: linkedUser.createdAt,
    email: linkedUser.email,
    id: linkedUser.id,
    nickname: linkedUser.nickname,
    username: linkedUser.username
  });
  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 0);
});

test("findOrCreateOAuthUser links an existing active user by verified email", async () => {
  const existingUser = makeUser({
    email: "github@example.com",
    id: "password-user-id",
    username: "password_user"
  });
  const fakeDb = new FakeOAuthDb([[], [existingUser]]);

  const result = await findOrCreateOAuthUser(
    fakeDb.db,
    makeProfile({
      email: "github@example.com",
      provider: "github",
      providerUserId: "github-user-id"
    })
  );

  assert.equal(result.id, existingUser.id);
  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 1);

  const insertedAccount = getOnlyRow(fakeDb.insertedOAuthAccounts);

  assert.match(String(insertedAccount.id), UUID_PATTERN);
  assert.equal(insertedAccount.userId, existingUser.id);
  assert.equal(insertedAccount.provider, "github");
  assert.equal(insertedAccount.providerUserId, "github-user-id");
  assert.equal(insertedAccount.email, "github@example.com");
  assert.equal(insertedAccount.displayName, "Demo User");
  assert.equal(insertedAccount.profileImageUrl, "https://example.com/avatar.png");
});

test("findOrCreateOAuthUser links an existing Naver user by verified email", async () => {
  const existingUser = makeUser({
    email: "demo@example.com",
    id: "password-user-id",
    username: "password_user"
  });
  const fakeDb = new FakeOAuthDb([[], [existingUser]]);

  const result = await findOrCreateOAuthUser(fakeDb.db, makeProfile());

  assert.equal(result.id, existingUser.id);
  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 1);

  const insertedAccount = getOnlyRow(fakeDb.insertedOAuthAccounts);

  assert.equal(insertedAccount.userId, existingUser.id);
  assert.equal(insertedAccount.provider, "naver");
  assert.equal(insertedAccount.providerUserId, "naver-user-id");
  assert.equal(insertedAccount.email, "demo@example.com");
});

test("findOrCreateOAuthUser creates a new user and OAuth account when no match exists", async () => {
  const fakeDb = new FakeOAuthDb([[], []]);

  const result = await findOrCreateOAuthUser(
    fakeDb.db,
    makeProfile({
      providerUserId: "Naver.User#123"
    })
  );

  assert.equal(fakeDb.insertedUsers.length, 1);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 1);

  const insertedUser = getOnlyRow(fakeDb.insertedUsers);

  assert.match(String(insertedUser.id), UUID_PATTERN);
  assert.equal(insertedUser.email, "demo@example.com");
  assert.equal(insertedUser.username, "naver_naveruser123");
  assert.equal(insertedUser.nickname, "Demo User");
  assert.equal(insertedUser.passwordHash, null);
  assert.equal(result.id, insertedUser.id);
  assert.equal(result.username, insertedUser.username);

  const insertedAccount = getOnlyRow(fakeDb.insertedOAuthAccounts);

  assert.match(String(insertedAccount.id), UUID_PATTERN);
  assert.equal(insertedAccount.userId, result.id);
  assert.equal(insertedAccount.provider, "naver");
  assert.equal(insertedAccount.providerUserId, "Naver.User#123");
  assert.equal(insertedAccount.email, "demo@example.com");
});

test("findOrCreateOAuthUser creates a Kakao user with a placeholder email when email is unavailable", async () => {
  const fakeDb = new FakeOAuthDb([[], []]);

  const result = await findOrCreateOAuthUser(
    fakeDb.db,
    makeProfile({
      displayName: "Kakao Demo",
      email: null,
      emailVerified: false,
      provider: "kakao",
      providerUserId: "123456789"
    })
  );

  assert.equal(fakeDb.insertedUsers.length, 1);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 1);

  const insertedUser = getOnlyRow(fakeDb.insertedUsers);
  const insertedAccount = getOnlyRow(fakeDb.insertedOAuthAccounts);

  assert.equal(insertedUser.email, "kakao_123456789@oauth.local");
  assert.equal(insertedUser.username, "kakao_123456789");
  assert.equal(insertedUser.nickname, "Kakao Demo");
  assert.equal(insertedUser.passwordHash, null);
  assert.equal(insertedAccount.email, "kakao_123456789@oauth.local");
  assert.equal(insertedAccount.provider, "kakao");
  assert.equal(insertedAccount.providerUserId, "123456789");
  assert.equal(result.email, "kakao_123456789@oauth.local");
});

test("findOrCreateOAuthUser returns an already linked Kakao user without requiring email", async () => {
  const linkedUser = makeUser({
    email: "kakao_123456789@oauth.local",
    id: "linked-kakao-user-id",
    nickname: "Kakao Demo",
    username: "kakao_123456789"
  });
  const fakeDb = new FakeOAuthDb([[{ userId: linkedUser.id }], [linkedUser]]);

  const result = await findOrCreateOAuthUser(
    fakeDb.db,
    makeProfile({
      email: null,
      emailVerified: false,
      provider: "kakao",
      providerUserId: "123456789"
    })
  );

  assert.deepEqual(result, {
    createdAt: linkedUser.createdAt,
    email: "kakao_123456789@oauth.local",
    id: linkedUser.id,
    nickname: "Kakao Demo",
    username: "kakao_123456789"
  });
  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 0);
});

test("findOrCreateOAuthUser rejects profiles without a trusted email", async () => {
  const fakeDb = new FakeOAuthDb();

  await assertOAuthUserConnectionError(
    () =>
      findOrCreateOAuthUser(
        fakeDb.db,
        makeProfile({
          email: null,
          emailVerified: false
        })
      ),
    OAUTH_EMAIL_REQUIRED
  );

  assert.equal(fakeDb.selectCalls, 1);
  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 0);
});

test("findOrCreateOAuthUser rejects a linked deleted user", async () => {
  const deletedUser = makeUser({
    deletedAt: new Date("2026-01-02T00:00:00.000Z"),
    id: "deleted-user-id"
  });
  const fakeDb = new FakeOAuthDb([[{ userId: deletedUser.id }], [deletedUser]]);

  await assertOAuthUserConnectionError(
    () => findOrCreateOAuthUser(fakeDb.db, makeProfile()),
    OAUTH_USER_DELETED
  );

  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 0);
});

test("findOrCreateOAuthUser rejects a deleted user matched by email", async () => {
  const deletedUser = makeUser({
    deletedAt: new Date("2026-01-02T00:00:00.000Z"),
    email: "demo@example.com",
    id: "deleted-email-user-id"
  });
  const fakeDb = new FakeOAuthDb([[], [deletedUser]]);

  await assertOAuthUserConnectionError(
    () =>
      findOrCreateOAuthUser(
        fakeDb.db,
        makeProfile({
          provider: "github",
          providerUserId: "github-deleted-user-id"
        })
      ),
    OAUTH_USER_DELETED,
    "github"
  );

  assert.equal(fakeDb.insertedUsers.length, 0);
  assert.equal(fakeDb.insertedOAuthAccounts.length, 0);
});

test("findOrCreateOAuthUser maps unexpected insert failures to a sanitized OAuth error", async () => {
  const fakeDb = new FakeOAuthDb([[], []]);

  fakeDb.failOAuthAccountInsert = true;

  await assertOAuthUserConnectionError(
    () => findOrCreateOAuthUser(fakeDb.db, makeProfile()),
    OAUTH_USER_LINK_FAILED
  );
});

test("createSocialUsername sanitizes and bounds provider usernames", () => {
  assert.equal(createSocialUsername("naver", "Naver.User#123"), "naver_naveruser123");
  assert.equal(createSocialUsername("github", "!!!"), "github_user");
  assert.equal(createSocialUsername("kakao", "x".repeat(100)), `kakao_${"x".repeat(20)}`);
});

class FakeOAuthDb {
  readonly db: Database;
  readonly insertedOAuthAccounts: InsertedRow[] = [];
  readonly insertedUsers: InsertedRow[] = [];
  failOAuthAccountInsert = false;
  selectCalls = 0;

  constructor(private readonly selectResults: unknown[][] = []) {
    const fakeDb = {
      insert: (table: unknown) => ({
        values: (row: InsertedRow) => {
          if (table === users) {
            this.insertedUsers.push(row);

            return {
              returning: async () => [makeUserFromInsert(row)]
            };
          }

          if (table === oauthAccounts) {
            if (this.failOAuthAccountInsert) {
              throw new Error("duplicate key value should not leak");
            }

            this.insertedOAuthAccounts.push(row);

            return {
              returning: async () => [row]
            };
          }

          throw new Error("Unexpected insert table");
        }
      }),
      select: () => ({
        from: () => ({
          where: async () => {
            this.selectCalls += 1;

            return this.selectResults.shift() ?? [];
          }
        })
      }),
      transaction: async <T>(callback: (tx: Database) => Promise<T>) =>
        callback(fakeDb as unknown as Database)
    };

    this.db = fakeDb as unknown as Database;
  }
}

async function assertOAuthUserConnectionError(
  run: () => Promise<unknown>,
  expectedOAuthError: string,
  expectedProvider = "naver"
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof OAuthUserConnectionError);
    assert.equal(error.provider, expectedProvider);
    assert.equal(error.oauthError, expectedOAuthError);
    assert.equal(error.message, "OAuth user connection failed");
    assert.doesNotMatch(error.message, /duplicate|secret|access.token/i);
    return;
  }

  assert.fail("Expected OAuthUserConnectionError");
}

function getOnlyRow(rows: InsertedRow[]): InsertedRow {
  assert.equal(rows.length, 1);

  const [row] = rows;

  assert.ok(row);

  return row;
}

function makeProfile(overrides: Partial<NormalizedOAuthProfile> = {}): NormalizedOAuthProfile {
  return {
    displayName: "Demo User",
    email: "demo@example.com",
    emailVerified: true,
    profileImageUrl: "https://example.com/avatar.png",
    provider: "naver",
    providerUserId: "naver-user-id",
    ...overrides
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    createdAt: NOW,
    deletedAt: null,
    email: "demo@example.com",
    id: "user-id",
    nickname: "Demo User",
    passwordHash: "hashed-password",
    updatedAt: NOW,
    username: "demo_user",
    ...overrides
  };
}

function makeUserFromInsert(row: InsertedRow): UserRow {
  return makeUser({
    email: String(row.email),
    id: String(row.id),
    nickname: String(row.nickname),
    passwordHash: row.passwordHash === null ? null : String(row.passwordHash),
    username: String(row.username)
  });
}
