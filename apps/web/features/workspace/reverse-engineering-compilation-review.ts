import type {
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationProposal
} from "@sketchcatch/types";

const MAX_VISIBLE_DIAGNOSTICS = 3;

export type ReverseEngineeringCompilationReview = {
  readonly changeCount: number;
  readonly diagnostics: readonly ArchitectureBoardCompilationDiagnostic[];
  readonly hiddenDiagnosticCount: number;
  readonly quality: ArchitectureBoardCompilationProposal["quality"];
  readonly referenceTemplateIds: readonly string[];
};

// 결과 패널은 제안 전체를 다시 해석하지 않고, 사용자가 확인할 최소 검토 정보만 뽑아냅니다.
export function createReverseEngineeringCompilationReview(
  proposal: ArchitectureBoardCompilationProposal
): ReverseEngineeringCompilationReview {
  return {
    changeCount: proposal.changes.length,
    diagnostics: proposal.diagnostics.slice(0, MAX_VISIBLE_DIAGNOSTICS),
    hiddenDiagnosticCount: Math.max(proposal.diagnostics.length - MAX_VISIBLE_DIAGNOSTICS, 0),
    quality: proposal.quality,
    referenceTemplateIds: proposal.provenance.referenceTemplateIds
  };
}

export function formatCompilationScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
