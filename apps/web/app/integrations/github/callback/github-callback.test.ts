import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
const workspaceApiSource = readFileSync(
  fileURLToPath(new URL("../../../../features/workspace/api.ts", import.meta.url)),
  "utf8"
);

test("GitHub setup callback verifies provider user access before listing repositories", () => {
  const authorizationBranchIndex = source.indexOf('authorization !== "verified"');
  const repositoryListIndex = source.indexOf(
    "const result = await listGitHubInstallationRepositories"
  );

  assert.ok(authorizationBranchIndex >= 0);
  assert.ok(repositoryListIndex > authorizationBranchIndex);
  assert.match(source, /createGitHubInstallationUserAuthorization/);
  assert.match(source, /window\.location\.assign\(result\.authorizationUrl\)/);
  assert.match(source, /GitHub 권한을 확인하는 중/);
});

test("GitHub setup callback requests a verified user authorization URL", () => {
  assert.match(
    workspaceApiSource,
    /export async function createGitHubInstallationUserAuthorization\([\s\S]*?"\/source-repositories\/github\/user-authorization-url"[\s\S]*?auth: true,[\s\S]*?method: "POST"/
  );
});
