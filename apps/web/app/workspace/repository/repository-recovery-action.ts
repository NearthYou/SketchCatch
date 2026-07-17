import type {
  GitHubInstallationConnection,
  GitHubInstalledRepositoryCandidate,
  SourceRepository
} from "@sketchcatch/types";

export type RepositoryRecoveryAction =
  | { readonly kind: "connect_github" }
  | {
      readonly kind: "add_repository_permission";
      readonly installationId: string;
      readonly managementUrl: string;
    }
  | {
      readonly kind: "connect_exact_repository";
      readonly candidate: GitHubInstalledRepositoryCandidate;
    }
  | {
      readonly kind: "analyze_connected_repository";
      readonly sourceRepositoryId: string;
    }
  | { readonly kind: "resolve_multiple_installations" }
  | { readonly kind: "retry_only" };

export function selectRepositoryRecoveryAction(input: {
  readonly repositoryUrl: string;
  readonly installations: readonly GitHubInstallationConnection[];
  readonly candidates: readonly GitHubInstalledRepositoryCandidate[];
  readonly activeRepository: SourceRepository | null;
}): RepositoryRecoveryAction {
  const target = parseGitHubRepositoryIdentity(input.repositoryUrl);

  if (input.installations.length > 1) {
    return { kind: "resolve_multiple_installations" };
  }

  if (input.activeRepository && isExactRepository(
    target,
    input.activeRepository.owner,
    input.activeRepository.name
  )) {
    return {
      kind: "analyze_connected_repository",
      sourceRepositoryId: input.activeRepository.id
    };
  }

  const exactCandidate = input.candidates.find((candidate) =>
    isExactRepository(target, candidate.owner, candidate.name)
  );
  if (exactCandidate) {
    return { kind: "connect_exact_repository", candidate: exactCandidate };
  }

  if (input.installations.length === 0) return { kind: "connect_github" };
  const [installation] = input.installations;
  if (installation?.htmlUrl) {
    return {
      kind: "add_repository_permission",
      installationId: installation.installationId,
      managementUrl: installation.htmlUrl
    };
  }
  return { kind: "retry_only" };
}

function parseGitHubRepositoryIdentity(repositoryUrl: string): {
  readonly owner: string;
  readonly name: string;
} {
  const url = new URL(repositoryUrl);
  const [owner, rawName, ...rest] = url.pathname.split("/").filter(Boolean);
  const name = rawName?.replace(/\.git$/iu, "");

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !owner ||
    !name ||
    rest.length > 0
  ) {
    throw new Error("Invalid GitHub Repository URL");
  }
  return { owner: owner.toLowerCase(), name: name.toLowerCase() };
}

function isExactRepository(
  target: { readonly owner: string; readonly name: string },
  owner: string,
  name: string
): boolean {
  return owner.toLowerCase() === target.owner && name.toLowerCase() === target.name;
}
