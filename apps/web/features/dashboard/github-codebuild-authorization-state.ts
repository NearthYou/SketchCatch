import type {
  GitHubAppAvailability,
  GitHubInstallationConnection
} from "@sketchcatch/types";

export type GitHubCodeBuildAuthorizationTarget =
  | { readonly status: "github_app_not_configured" }
  | { readonly status: "github_installation_required" }
  | { readonly status: "multiple_github_installations_unsupported" }
  | {
      readonly status: "ready";
      readonly installation: GitHubInstallationConnection;
    };

// AWS 승인 전에 사용자가 기대해야 할 GitHub 계정을 하나로 확정합니다.
export function deriveGitHubCodeBuildAuthorizationTarget(
  installations: readonly GitHubInstallationConnection[],
  availability: GitHubAppAvailability = {
    connectionSetup: "ready",
    installationRead: "ready"
  }
): GitHubCodeBuildAuthorizationTarget {
  if (
    availability.installationRead !== "ready" ||
    (installations.length === 0 && availability.connectionSetup !== "ready")
  ) {
    return { status: "github_app_not_configured" };
  }

  if (installations.length === 0) {
    return { status: "github_installation_required" };
  }
  if (installations.length > 1) {
    return { status: "multiple_github_installations_unsupported" };
  }
  return { status: "ready", installation: installations[0]! };
}
