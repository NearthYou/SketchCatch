import assert from "node:assert/strict";
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
