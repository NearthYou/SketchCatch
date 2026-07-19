import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubInstallationConnection } from "@sketchcatch/types";
import {
  deriveAwsCodeConnectionConnectedState,
  deriveGitHubCodeBuildAuthorizationTarget,
  getAwsCodeConnectionDisplayName
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

test("an available AWS CodeConnection reports OAuth connected and defers repository verification to the project", () => {
  assert.deepEqual(deriveAwsCodeConnectionConnectedState("AVAILABLE"), {
    actionHref: "https://github.com/settings/installations",
    actionLabel: "AWS Connector 권한 관리",
    description: "Repository 접근은 프로젝트 저장·검증에서 확인합니다",
    status: "connected",
    title: "AWS OAuth 연결됨"
  });
});

test("pending AWS CodeConnections do not expose the connected presentation", () => {
  assert.equal(deriveAwsCodeConnectionConnectedState("PENDING"), null);
});

test("AWS approval guidance identifies the exact generated connection name", () => {
  assert.equal(
    getAwsCodeConnectionDisplayName("ee0c1542-4627-481e-a6b5-433b16f50f3b"),
    "sketchcatch-ee0c1542-github"
  );
});
