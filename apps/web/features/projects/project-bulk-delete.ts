import type { Project, ProjectDeletePreview } from "@sketchcatch/types";

export type BulkProjectDeleteCandidate =
  | {
      readonly preview: ProjectDeletePreview;
      readonly project: Project;
      readonly status: "ready";
    }
  | {
      readonly project: Project;
      readonly status: "unavailable";
    };

type ReadyBulkProjectDeleteCandidate = Extract<
  BulkProjectDeleteCandidate,
  { readonly status: "ready" }
>;
type UnavailableBulkProjectDeleteCandidate = Extract<
  BulkProjectDeleteCandidate,
  { readonly status: "unavailable" }
>;

export type BulkProjectDeleteAction = "delete_project" | "destroy_then_delete";

export type BulkProjectDeletion = ReadyBulkProjectDeleteCandidate & {
  readonly action: BulkProjectDeleteAction;
};

export type BulkProjectDeletePlan = {
  readonly deletable: readonly BulkProjectDeletion[];
  readonly protected: readonly ReadyBulkProjectDeleteCandidate[];
  readonly unavailable: readonly UnavailableBulkProjectDeleteCandidate[];
};

// gg: Split each preflight result so the dialog can show exactly what it will delete or keep.
export function buildBulkProjectDeletePlan(
  candidates: readonly BulkProjectDeleteCandidate[]
): BulkProjectDeletePlan {
  const readyCandidates = candidates.filter(isReadyBulkProjectDeleteCandidate);
  const deletable = readyCandidates.flatMap((candidate) => {
    const action = getBulkProjectDeleteAction(candidate.preview);

    return action ? [{ ...candidate, action }] : [];
  });
  const deletableProjectIds = new Set(deletable.map((candidate) => candidate.project.id));

  return {
    deletable,
    protected: readyCandidates.filter((candidate) => !deletableProjectIds.has(candidate.project.id)),
    unavailable: candidates.filter(isUnavailableBulkProjectDeleteCandidate)
  };
}

// gg: Choose automatic infrastructure deletion first, then ordinary project cleanup when no AWS resource remains.
function getBulkProjectDeleteAction(
  preview: ProjectDeletePreview
): BulkProjectDeleteAction | undefined {
  if (preview.availableActions.includes("destroy_then_delete")) {
    return "destroy_then_delete";
  }

  if (preview.availableActions.includes("delete_project")) {
    return "delete_project";
  }

  return undefined;
}

// gg: Keep unavailable previews distinct from projects that the server intentionally protects.
function isReadyBulkProjectDeleteCandidate(
  candidate: BulkProjectDeleteCandidate
): candidate is ReadyBulkProjectDeleteCandidate {
  return candidate.status === "ready";
}

// gg: Preserve failed preflight results so a bulk deletion can never silently include them.
function isUnavailableBulkProjectDeleteCandidate(
  candidate: BulkProjectDeleteCandidate
): candidate is UnavailableBulkProjectDeleteCandidate {
  return candidate.status === "unavailable";
}

/** Gives the confirmation dialog a bounded, count-based progress value. */
export function getBulkProjectDeleteProgress(input: {
  readonly completedCount: number;
  readonly totalCount: number;
}): { readonly currentCount: number; readonly percent: number; readonly totalCount: number } {
  const totalCount = Math.max(0, input.totalCount);
  const currentCount = Math.min(totalCount, Math.max(0, input.completedCount));

  return {
    currentCount,
    percent: totalCount === 0 ? 0 : Math.round((currentCount / totalCount) * 100),
    totalCount
  };
}
