import type {
  ProjectDeliveryProfile,
  RepositoryAnalysisRecord,
  SourceRepository
} from "@sketchcatch/types";

export type DeliveryRepositoryPresentationState =
  | {
      readonly kind: "connected";
      readonly repository: SourceRepository;
      readonly analysisTarget: RepositoryAnalysisRecord | null;
    }
  | {
      readonly kind: "connection_required";
      readonly repository: null;
      readonly analysisTarget: RepositoryAnalysisRecord;
    }
  | {
      readonly kind: "not_selected";
      readonly repository: null;
      readonly analysisTarget: null;
    };

export function getDeliveryRepositoryPresentationState(
  profile: Pick<ProjectDeliveryProfile, "repositoryAnalysisTarget" | "sourceRepository">
): DeliveryRepositoryPresentationState {
  if (profile.sourceRepository) {
    return {
      kind: "connected",
      repository: profile.sourceRepository,
      analysisTarget: profile.repositoryAnalysisTarget
    };
  }
  if (profile.repositoryAnalysisTarget) {
    return {
      kind: "connection_required",
      repository: null,
      analysisTarget: profile.repositoryAnalysisTarget
    };
  }
  return { kind: "not_selected", repository: null, analysisTarget: null };
}
