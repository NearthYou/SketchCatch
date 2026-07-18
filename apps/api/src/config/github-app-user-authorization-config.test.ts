import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  getRuntimeEnv,
  requireGitHubAppUserAuthorizationConfig
} from "./env.js";

test("GitHub App user authorization rejects a malformed callback URL clearly", () => {
  assert.throws(
    () =>
      requireGitHubAppUserAuthorizationConfig({
        ...getRuntimeEnv(),
        githubAppClientId: "client-id",
        githubAppClientSecret: "client-secret",
        githubAppCallbackUrl: "not-an-absolute-url"
      }),
    /GIT_APP_CALLBACK_URL must be a valid absolute URL/
  );
});

test("local environment example documents GitHub App user authorization credentials", () => {
  const example = readFileSync(new URL("../../../../.env.example", import.meta.url), "utf8");

  assert.match(example, /^GIT_APP_CLIENT_ID=/m);
  assert.match(example, /^GIT_APP_CLIENT_SECRET=/m);
});
