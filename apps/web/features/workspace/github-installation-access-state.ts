import type {
  GitHubInstallationConnection,
  ListGitHubInstallationsResponse
} from "@sketchcatch/types";

export type GitHubInstallationAccessState =
  | { readonly status: "server_not_configured" }
  | { readonly status: "connection_setup_not_configured" }
  | { readonly status: "connection_required" }
  | {
      readonly status: "connected";
      readonly installations: readonly GitHubInstallationConnection[];
    };

export function deriveGitHubInstallationAccessState(
  response: ListGitHubInstallationsResponse
): GitHubInstallationAccessState {
  if (response.availability.installationRead !== "ready") {
    return { status: "server_not_configured" };
  }

  if (response.installations.length > 0) {
    return {
      status: "connected",
      installations: response.installations
    };
  }

  if (response.availability.connectionSetup !== "ready") {
    return { status: "connection_setup_not_configured" };
  }

  return { status: "connection_required" };
}
