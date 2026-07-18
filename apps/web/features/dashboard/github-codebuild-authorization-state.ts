import type {
  AwsCodeConnectionStatus,
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

export type AwsCodeConnectionRepositoryAccessState = Readonly<{
  actionHref: string;
  actionLabel: string;
  description: string;
  status: "repository_access_unverified";
  title: string;
}>;

export function deriveAwsCodeConnectionRepositoryAccessState(
  status: AwsCodeConnectionStatus
): AwsCodeConnectionRepositoryAccessState | null {
  if (status !== "AVAILABLE") return null;
  return {
    actionHref: "https://github.com/apps/aws-connector-for-github/installations/new",
    actionLabel: "AWS Connector 설치·권한 설정",
    description: "Repository 접근은 아직 확인되지 않았습니다",
    status: "repository_access_unverified",
    title: "AWS OAuth 연결됨"
  };
}

export function getAwsCodeConnectionDisplayName(awsConnectionId: string): string {
  return `sketchcatch-${awsConnectionId.replaceAll("-", "").slice(0, 8)}-github`;
}

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
