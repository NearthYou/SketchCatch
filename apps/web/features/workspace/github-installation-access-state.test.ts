import assert from "node:assert/strict";
import test from "node:test";
import { deriveGitHubInstallationAccessState } from "./github-installation-access-state";

test("GitHub installation access distinguishes server setup from a missing user connection", () => {
  assert.deepEqual(deriveGitHubInstallationAccessState({
    availability: {
      connectionSetup: "not_configured",
      installationRead: "not_configured"
    },
    installations: []
  }), { status: "server_not_configured" });
  assert.deepEqual(deriveGitHubInstallationAccessState({
    availability: {
      connectionSetup: "ready",
      installationRead: "ready"
    },
    installations: []
  }), { status: "connection_required" });
});

test("GitHub installation access preserves existing connections during partial setup", () => {
  const installation = {
    installationId: "installation-1",
    accountLogin: "sketchcatch",
    accountType: "Organization",
    repositorySelection: "selected" as const,
    repositoryCount: 1,
    htmlUrl: null
  };
  assert.deepEqual(deriveGitHubInstallationAccessState({
    availability: {
      connectionSetup: "not_configured",
      installationRead: "ready"
    },
    installations: [installation]
  }), {
    status: "connected",
    installations: [installation]
  });
  assert.deepEqual(deriveGitHubInstallationAccessState({
    availability: {
      connectionSetup: "not_configured",
      installationRead: "ready"
    },
    installations: []
  }), { status: "connection_setup_not_configured" });
});
