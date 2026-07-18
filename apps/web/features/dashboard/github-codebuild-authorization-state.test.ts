import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubInstallationConnection } from "@sketchcatch/types";
import {
  deriveAwsCodeConnectionRepositoryAccessState,
  deriveGitHubCodeBuildAuthorizationTarget
} from "./github-codebuild-authorization-state";

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

test("AWS CodeBuild authorization distinguishes an unconfigured GitHub App server", () => {
  assert.deepEqual(deriveGitHubCodeBuildAuthorizationTarget([], {
    connectionSetup: "not_configured",
    installationRead: "not_configured"
  }), {
    status: "github_app_not_configured"
  });
});

test("AWS CodeBuild authorization keeps an existing installation when only new setup is unavailable", () => {
  assert.deepEqual(
    deriveGitHubCodeBuildAuthorizationTarget([
      {
        installationId: "installation-1",
        accountLogin: "sketchcatch",
        accountType: "Organization",
        repositorySelection: "selected",
        repositoryCount: 1,
        htmlUrl: null
      }
    ], {
      connectionSetup: "not_configured",
      installationRead: "ready"
    }),
    {
      status: "ready",
      installation: {
        installationId: "installation-1",
        accountLogin: "sketchcatch",
        accountType: "Organization",
        repositorySelection: "selected",
        repositoryCount: 1,
        htmlUrl: null
      }
    }
  );
});

test("AWS CodeBuild authorization blocks a missing installation when new setup is unavailable", () => {
  assert.deepEqual(deriveGitHubCodeBuildAuthorizationTarget([], {
    connectionSetup: "not_configured",
    installationRead: "ready"
  }), {
    status: "github_app_not_configured"
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

test("an available AWS CodeConnection remains visibly unverified until repository access succeeds", () => {
  assert.deepEqual(deriveAwsCodeConnectionRepositoryAccessState("AVAILABLE"), {
    actionHref: "https://github.com/marketplace/aws-connector-for-github",
    actionLabel: "AWS Connector 설치·권한 설정",
    description: "Repository 접근은 아직 확인되지 않았습니다",
    status: "repository_access_unverified",
    title: "AWS OAuth 연결됨"
  });
});

test("pending AWS CodeConnections do not expose the repository access presentation", () => {
  assert.equal(deriveAwsCodeConnectionRepositoryAccessState("PENDING"), null);
});
