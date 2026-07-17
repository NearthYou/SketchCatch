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

const OUTCOME_METRICS = [
  { key: "nodeOverlapCount", label: "Resource 겹침" },
  { key: "edgeNodeIntersectionCount", label: "Resource를 지나는 연결선" },
  { key: "edgeCrossingCount", label: "서로 교차하는 연결선" },
  { key: "parentBoundaryViolationCount", label: "영역 경계 밖 Resource" },
  { key: "siblingAreaOverlapCount", label: "서로 겹치는 영역" },
  { key: "edgeAreaTitleIntersectionCount", label: "영역 제목을 지나는 연결선" }
] as const;

export type ArchitectureBoardCompilationOutcomeItem = {
  readonly after: number;
  readonly before: number;
  readonly key: (typeof OUTCOME_METRICS)[number]["key"];
  readonly label: string;
  readonly summary: string;
  readonly tone: "improved" | "unchanged" | "regressed";
};

export type ArchitectureBoardCompilationOutcome = {
  readonly headline: string;
  readonly items: readonly ArchitectureBoardCompilationOutcomeItem[];
  readonly remainingDiagnosticCount: number;
  readonly remainingLayoutIssueCount: number;
  readonly reviewSummary: string;
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
  readonly outcome: ArchitectureBoardCompilationOutcome;
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
    outcome: createCompilationOutcome(proposal),
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

function createCompilationOutcome(
  proposal: ArchitectureBoardCompilationProposal
): ArchitectureBoardCompilationOutcome {
  const items = OUTCOME_METRICS.flatMap(({ key, label }) => {
    const before = readCountMetric(proposal.quality.before.metrics, key);
    const after = readCountMetric(proposal.quality.after.metrics, key);

    return before === 0 && after === 0
      ? []
      : [{ after, before, key, label, ...presentMetricDelta(before, after) }];
  });
  const beforeIssueCount = items.reduce((total, item) => total + item.before, 0);
  const remainingLayoutIssueCount = items.reduce((total, item) => total + item.after, 0);
  const remainingDiagnosticCount = proposal.diagnostics.filter(
    ({ level }) => level === "error" || level === "warning"
  ).length;

  return {
    headline: createOutcomeHeadline(beforeIssueCount, remainingLayoutIssueCount),
    items,
    remainingDiagnosticCount,
    remainingLayoutIssueCount,
    reviewSummary: createReviewSummary(remainingLayoutIssueCount, remainingDiagnosticCount)
  };
}

function readCountMetric(metrics: Readonly<Record<string, number>>, key: string): number {
  const value = metrics[key];

  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function presentMetricDelta(
  before: number,
  after: number
): Pick<ArchitectureBoardCompilationOutcomeItem, "summary" | "tone"> {
  if (after < before) {
    const resolved = before - after;

    return {
      summary: after === 0 ? `${resolved}건 해결` : `${resolved}건 감소 · ${after}건 남음`,
      tone: "improved"
    };
  }

  if (after > before) {
    return {
      summary: `${after - before}건 증가 · ${after}건 남음`,
      tone: "regressed"
    };
  }

  return {
    summary: `${after}건 남음`,
    tone: "unchanged"
  };
}

function createOutcomeHeadline(beforeIssueCount: number, afterIssueCount: number): string {
  if (afterIssueCount < beforeIssueCount) {
    return `배치 문제 ${beforeIssueCount - afterIssueCount}건을 줄였습니다.`;
  }

  if (afterIssueCount > beforeIssueCount) {
    return `배치 문제 ${afterIssueCount - beforeIssueCount}건이 늘었습니다.`;
  }

  return afterIssueCount === 0
    ? "추적된 배치 문제가 없습니다."
    : `추적된 배치 문제 ${afterIssueCount}건이 그대로 남아 있습니다.`;
}

function createReviewSummary(layoutIssueCount: number, diagnosticCount: number): string {
  if (layoutIssueCount > 0 && diagnosticCount > 0) {
    return `배치 문제 ${layoutIssueCount}건과 추가 확인 ${diagnosticCount}건이 남아 있습니다.`;
  }

  if (layoutIssueCount > 0) {
    return `배치 문제 ${layoutIssueCount}건이 남아 있습니다.`;
  }

  if (diagnosticCount > 0) {
    return `추가 확인 ${diagnosticCount}건이 남아 있습니다.`;
  }

  return "현재 지표에서 추가로 확인할 배치 문제가 없습니다.";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
