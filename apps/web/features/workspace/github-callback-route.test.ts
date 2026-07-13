import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("GitHub App callback keeps repository selection and return flow visible", async () => {
  const source = await readFile(
    new URL("../../app/integrations/github/callback/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /listGitHubInstallationRepositories/);
  assert.match(source, /connectGitHubSourceRepository/);
  assert.match(source, /useAuth/);
  assert.match(source, /getGitHubCallbackAuthDecision/);
  assert.match(source, /decision\.kind === "wait"/);
  assert.match(source, /router\.replace\(decision\.href\)/);
  assert.match(source, /Repository 선택/);
  assert.match(source, /router\.replace/);
  assert.match(source, /Manage permissions in settings/);
  assert.match(source, /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/settings\?tab=github/);
  assert.doesNotMatch(source, /createGitHubSourceRepositoryInstallUrl/);
  assert.doesNotMatch(source, /return null/);
});
