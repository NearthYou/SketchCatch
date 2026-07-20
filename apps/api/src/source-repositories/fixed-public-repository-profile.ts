export const AUDIENCE_LIVE_CHECK_FROZEN_REVISION =
  "23a87399cbe3456f3f427140f88b8d199ace34f9";

type PublicRepositoryIdentity = {
  readonly owner: string;
  readonly repo: string;
};

/**
 * Keeps the audience demonstration reproducible even if its public main branch changes.
 * A caller can still explicitly analyse a non-main branch as normal repository evidence.
 */
export function resolveFrozenPublicRepositoryRevision(
  repository: PublicRepositoryIdentity,
  requestedBranch: string,
  resolvedBranch: string
): string | null {
  if (
    repository.owner !== "chaekang" ||
    repository.repo !== "audience-live-check" ||
    resolvedBranch.trim().toLowerCase() !== "main"
  ) {
    return null;
  }

  const requested = requestedBranch.trim().toLowerCase();
  return requested.length === 0 || requested === "main"
    ? AUDIENCE_LIVE_CHECK_FROZEN_REVISION
    : null;
}
