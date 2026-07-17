import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubInstallationConnection } from "@sketchcatch/types";
import { deriveGitHubCodeBuildAuthorizationTarget } from "./github-codebuild-authorization-state";

const installation: GitHubInstallationConnection = {
  installationId: "installation-1",
  accountLogin: "sketchcatch-team",
  accountType: "Organization",
  repositorySelection: "selected",
  repositoryCount: 3,
  htmlUrl: "https://github.com/settings/installations/1"
};

test("AWS CodeBuild authorization requires one GitHub App installation", () => {
  assert.deepEqual(deriveGitHubCodeBuildAuthorizationTarget([]), {
    status: "github_installation_required"
  });
});

test("AWS CodeBuild authorization rejects multiple GitHub App installations", () => {
  assert.deepEqual(
    deriveGitHubCodeBuildAuthorizationTarget([
      installation,
      { ...installation, installationId: "installation-2", accountLogin: "other-team" }
    ]),
    { status: "multiple_github_installations_unsupported" }
  );
});

test("AWS CodeBuild authorization exposes the only expected GitHub account", () => {
  assert.deepEqual(deriveGitHubCodeBuildAuthorizationTarget([installation]), {
    status: "ready",
    installation
  });
});
