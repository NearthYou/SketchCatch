import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const gitCicdDirectory = new URL("../git-cicd/", import.meta.url);
const gitCicdRouteSource = readFileSync(
  new URL("../routes/git-cicd-handoffs.ts", import.meta.url),
  "utf8"
);
const handoffServiceSource = readFileSync(
  new URL("../git-cicd/git-cicd-handoff-service.ts", import.meta.url),
  "utf8"
);

test("GitHub login OAuth credentials are not used by CI/CD repository operations", () => {
  for (const entry of readdirSync(gitCicdDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
      continue;
    }

    const source = readFileSync(new URL(entry.name, gitCicdDirectory), "utf8");
    assert.doesNotMatch(source, /requireOAuthProviderConfig|exchangeOAuthCodeForAccessToken|GIT_OAUTH/);
  }
});

test("CI/CD routes do not expose a repository mutation OAuth callback", () => {
  assert.doesNotMatch(gitCicdRouteSource, /github-oauth|apply-with-github-oauth/i);
});

test("new GitHub handoffs rely on GitHub App permissions without OAuth fallback", () => {
  assert.match(handoffServiceSource, /githubAppPermissionRequired:\s*false/);
  assert.doesNotMatch(handoffServiceSource, /githubOAuthRequired/);
});
