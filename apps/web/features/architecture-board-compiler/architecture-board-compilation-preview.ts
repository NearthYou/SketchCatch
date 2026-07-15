import type {
  ArchitectureBoardCompilationChangeKind,
  ArchitectureBoardCompilationDiagnosticLevel,
  ArchitectureBoardCompilationProposal
} from "@sketchcatch/types";

const CHANGE_KIND_ORDER: readonly ArchitectureBoardCompilationChangeKind[] = [
  "resource",
  "relationship",
  "configuration",
  "containment",
  "presentation",
  "geometry",
  "edge-routing"
];

const CHANGE_KIND_LABEL: Record<ArchitectureBoardCompilationChangeKind, string> = {
  resource: "리소스",
  relationship: "관계",
  configuration: "설정",
  containment: "영역",
  presentation: "표현",
  geometry: "배치",
  "edge-routing": "연결선"
};

const DIAGNOSTIC_LEVEL_ORDER: readonly ArchitectureBoardCompilationDiagnosticLevel[] = [
  "error",
  "warning",
  "info"
];

const DIAGNOSTIC_LEVEL_LABEL: Record<ArchitectureBoardCompilationDiagnosticLevel, string> = {
  error: "오류",
  warning: "경고",
  info: "안내"
};

export type ArchitectureBoardCompilationPreview = {
  readonly changeGroups: readonly {
    readonly kind: ArchitectureBoardCompilationChangeKind;
    readonly label: string;
    readonly count: number;
  }[];
  readonly diagnosticGroups: readonly {
    readonly level: ArchitectureBoardCompilationDiagnosticLevel;
    readonly label: string;
    readonly count: number;
  }[];
  readonly diagnosticSummaries: readonly string[];
  readonly quality: {
    readonly beforeScore: number;
    readonly afterScore: number;
    readonly scoreDelta: number;
    readonly compilationDistance: number;
  };
  readonly compilerVersion: string;
  readonly candidateId: string;
  readonly referenceTemplateIds: readonly string[];
};

/** Proposal 원본은 건드리지 않고, Board 미리보기에 필요한 판단 근거만 압축한다. */
export function createArchitectureBoardCompilationPreview(
  proposal: ArchitectureBoardCompilationProposal
): ArchitectureBoardCompilationPreview {
  return {
    changeGroups: CHANGE_KIND_ORDER.flatMap((kind) => {
      const count = proposal.changes.filter((change) => change.kind === kind).length;

      return count === 0 ? [] : [{ kind, label: CHANGE_KIND_LABEL[kind], count }];
    }),
    diagnosticGroups: DIAGNOSTIC_LEVEL_ORDER.flatMap((level) => {
      const count = proposal.diagnostics.filter((diagnostic) => diagnostic.level === level).length;

      return count === 0 ? [] : [{ level, label: DIAGNOSTIC_LEVEL_LABEL[level], count }];
    }),
    diagnosticSummaries: DIAGNOSTIC_LEVEL_ORDER.flatMap((level) =>
      proposal.diagnostics
        .filter((diagnostic) => diagnostic.level === level)
        .map((diagnostic) => diagnostic.summary)
    ),
    quality: {
      beforeScore: proposal.quality.before.score,
      afterScore: proposal.quality.after.score,
      scoreDelta: proposal.quality.after.score - proposal.quality.before.score,
      compilationDistance: proposal.quality.compilationDistance
    },
    compilerVersion: proposal.provenance.compilerVersion,
    candidateId: proposal.provenance.candidateId,
    referenceTemplateIds: unique(proposal.provenance.referenceTemplateIds)
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
