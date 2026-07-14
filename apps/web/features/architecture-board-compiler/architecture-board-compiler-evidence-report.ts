import { createHash } from "node:crypto";
import type {
  ArchitectureBoardCompilationChangeKind,
  ArchitectureBoardCompilationDiagnostic,
  ArchitectureBoardCompilationDiagnosticLevel,
  ArchitectureBoardCompilationProposal,
  ArchitectureBoardCompilationQuality,
  DiagramJson
} from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS,
  assertArchitectureBoardCompilerEvidenceRegressionBudget,
  type ArchitectureBoardCompilerEvidenceRegressionBudget,
  type ArchitectureBoardCompilerEvidenceRegressionViolation,
  type ArchitectureBoardCompilerVisualAnomalyMetricKey
} from "./architecture-board-compiler-evidence-baseline";
import {
  validateArchitectureBoardCompilerEvidenceSources,
  type ArchitectureBoardCompilerEvidenceSourceValidationReport
} from "./architecture-board-compiler-evidence-validation";
import { reviewArchitectureBoardTemplate } from "./template-review";

export const ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REPORT_VERSION =
  "architecture-board-compiler-evidence-report/v1";

const CHANGE_KIND_ORDER: readonly ArchitectureBoardCompilationChangeKind[] = [
  "resource",
  "relationship",
  "configuration",
  "containment",
  "presentation",
  "geometry",
  "edge-routing"
];
const DIAGNOSTIC_LEVEL_ORDER: readonly ArchitectureBoardCompilationDiagnosticLevel[] = [
  "error",
  "warning",
  "info"
];
const CHANGE_ACTION_ORDER = ["add", "remove", "modify"] as const;
type EvidenceSource = "brainboard" | "repository";
type VisualAnomalyMetricKey = ArchitectureBoardCompilerVisualAnomalyMetricKey;

export type ArchitectureBoardCompilerEvidenceTemplate = {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly sourceDiagram: DiagramJson;
  readonly title: string;
};

export type ArchitectureBoardCompilerUnavailableEvidence = {
  readonly id: string;
  readonly reason: string;
  readonly source: EvidenceSource;
  readonly title: string;
};

export type ArchitectureBoardCompilerEvidenceInput = {
  readonly availableTemplates: readonly ArchitectureBoardCompilerEvidenceTemplate[];
  readonly unavailableTemplates: readonly ArchitectureBoardCompilerUnavailableEvidence[];
};

export type ArchitectureBoardCompilerEvidenceReportOptions = {
  readonly aggregateAfterVisualAnomalyBudget?: ArchitectureBoardCompilerEvidenceRegressionBudget;
};

type ReportedQuality = {
  readonly metrics: Readonly<Record<string, number>>;
  readonly score: number;
  readonly semanticDiagnosticPenalty: number;
  readonly structuralPenalty: number;
  readonly visualPenalty: number;
};

export type ArchitectureBoardCompilerEvidenceReport = {
  readonly compilerVersion: string;
  readonly reportVersion: typeof ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REPORT_VERSION;
  readonly summary: {
    readonly availableTemplateCount: number;
    readonly changesByKind: Readonly<Record<ArchitectureBoardCompilationChangeKind, number>>;
    readonly diagnosticCount: number;
    readonly diagnosticsByLevel: Readonly<
      Record<ArchitectureBoardCompilationDiagnosticLevel, number>
    >;
    readonly meanAfterScore: number;
    readonly meanBeforeScore: number;
    readonly meanScoreDelta: number;
    readonly totalChangeCount: number;
    readonly visualAnomalies: {
      readonly after: Readonly<Record<VisualAnomalyMetricKey, number>>;
      readonly before: Readonly<Record<VisualAnomalyMetricKey, number>>;
    };
  };
  readonly templates: readonly ArchitectureBoardCompilerEvidenceTemplateResult[];
  readonly unavailableTemplates: readonly ArchitectureBoardCompilerUnavailableEvidence[];
  readonly anomalies: {
    readonly diagnosticTemplateIds: readonly string[];
    readonly errorDiagnosticTemplateIds: readonly string[];
    readonly unchangedProposalTemplateIds: readonly string[];
    readonly worsenedQualityTemplateIds: readonly string[];
  };
  readonly regressionGuard?: {
    readonly aggregateAfterVisualAnomalyBudget: ArchitectureBoardCompilerEvidenceRegressionBudget;
    readonly status: "within-budget" | "violations";
    readonly violations: readonly ArchitectureBoardCompilerEvidenceRegressionViolation[];
  };
  readonly sourceValidation: ArchitectureBoardCompilerEvidenceSourceValidationReport;
};

export type ArchitectureBoardCompilerEvidenceTemplateResult = {
  readonly candidateId: string;
  readonly changes: {
    readonly byKind: Readonly<Record<ArchitectureBoardCompilationChangeKind, number>>;
    readonly groups: readonly ArchitectureBoardCompilerEvidenceChangeGroup[];
    readonly total: number;
  };
  readonly diagnostics: {
    readonly byLevel: Readonly<Record<ArchitectureBoardCompilationDiagnosticLevel, number>>;
    readonly items: readonly ArchitectureBoardCompilerEvidenceDiagnostic[];
    readonly total: number;
  };
  readonly compilerVersion: string;
  readonly diagramFingerprints: {
    readonly compiled: string;
    readonly source: string;
  };
  readonly id: string;
  readonly quality: {
    readonly after: ReportedQuality;
    readonly before: ReportedQuality;
    readonly compilationDistance: number;
    readonly scoreDelta: number;
  };
  readonly referenceTemplateIds: readonly string[];
  readonly source: EvidenceSource;
  readonly title: string;
};

export type ArchitectureBoardCompilerEvidenceChangeGroup = {
  readonly action: (typeof CHANGE_ACTION_ORDER)[number];
  readonly count: number;
  readonly kind: ArchitectureBoardCompilationChangeKind;
  readonly totalCost: number;
};

export type ArchitectureBoardCompilerEvidenceDiagnostic = {
  readonly code: string;
  readonly count: number;
  readonly level: ArchitectureBoardCompilationDiagnosticLevel;
  readonly penalty: number;
  readonly sampleMessage: string;
  readonly summary: string;
};

// 원본 fixture는 읽기 전용 증거다. Review 경로에 복제본만 전달해 Gallery/원본 Board를 바꾸지 않는다.
export function createArchitectureBoardCompilerEvidenceReport(
  input: ArchitectureBoardCompilerEvidenceInput,
  options: ArchitectureBoardCompilerEvidenceReportOptions = {}
): ArchitectureBoardCompilerEvidenceReport {
  const templates = [...input.availableTemplates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(createTemplateResult);
  const unavailableTemplates = [...input.unavailableTemplates].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const summary = createSummary(templates);
  const regressionGuard = options.aggregateAfterVisualAnomalyBudget
    ? createRegressionGuard(summary.visualAnomalies.after, options.aggregateAfterVisualAnomalyBudget)
    : undefined;

  return {
    reportVersion: ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REPORT_VERSION,
    compilerVersion: getCompilerVersion(templates),
    summary,
    templates,
    unavailableTemplates,
    sourceValidation: validateArchitectureBoardCompilerEvidenceSources(input),
    ...(regressionGuard ? { regressionGuard } : {}),
    anomalies: {
      diagnosticTemplateIds: templates
        .filter((template) => template.diagnostics.total > 0)
        .map((template) => template.id),
      errorDiagnosticTemplateIds: templates
        .filter((template) => template.diagnostics.byLevel.error > 0)
        .map((template) => template.id),
      unchangedProposalTemplateIds: templates
        .filter((template) => template.changes.total === 0)
        .map((template) => template.id),
      worsenedQualityTemplateIds: templates
        .filter((template) => template.quality.scoreDelta > 0)
        .map((template) => template.id)
    }
  };
}

function createRegressionGuard(
  actual: Readonly<Record<VisualAnomalyMetricKey, number>>,
  aggregateAfterVisualAnomalyBudget: ArchitectureBoardCompilerEvidenceRegressionBudget
): NonNullable<ArchitectureBoardCompilerEvidenceReport["regressionGuard"]> {
  const violations = assertArchitectureBoardCompilerEvidenceRegressionBudget(
    actual,
    aggregateAfterVisualAnomalyBudget
  );

  return {
    status: violations.length === 0 ? "within-budget" : "violations",
    aggregateAfterVisualAnomalyBudget,
    violations
  };
}

export function renderArchitectureBoardCompilerEvidenceReport(
  report: ArchitectureBoardCompilerEvidenceReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function createTemplateResult(
  template: ArchitectureBoardCompilerEvidenceTemplate
): ArchitectureBoardCompilerEvidenceTemplateResult {
  const proposal = reviewArchitectureBoardTemplate(structuredClone(template.sourceDiagram));
  const changes = proposal.changes;
  const diagnostics = proposal.diagnostics;

  return {
    id: template.id,
    title: template.title,
    source: template.source,
    compilerVersion: proposal.provenance.compilerVersion,
    candidateId: proposal.provenance.candidateId,
    diagramFingerprints: {
      source: fingerprintDiagram(template.sourceDiagram),
      compiled: fingerprintDiagram(proposal.diagram)
    },
    changes: {
      total: changes.length,
      byKind: countByOrder(changes, CHANGE_KIND_ORDER, (change) => change.kind),
      groups: createChangeGroups(changes)
    },
    diagnostics: {
      total: diagnostics.length,
      byLevel: countByOrder(diagnostics, DIAGNOSTIC_LEVEL_ORDER, (diagnostic) => diagnostic.level),
      items: createDiagnosticSummaries(diagnostics)
    },
    quality: {
      before: reportQuality(proposal.quality.before),
      after: reportQuality(proposal.quality.after),
      compilationDistance: proposal.quality.compilationDistance,
      scoreDelta: round(proposal.quality.after.score - proposal.quality.before.score)
    },
    referenceTemplateIds: [...new Set(proposal.provenance.referenceTemplateIds)].sort()
  };
}

function getCompilerVersion(
  templates: readonly ArchitectureBoardCompilerEvidenceTemplateResult[]
): string {
  return templates[0]?.compilerVersion ?? "unknown";
}

function reportQuality(quality: ArchitectureBoardCompilationQuality): ReportedQuality {
  return {
    score: round(quality.score),
    visualPenalty: round(quality.visualPenalty),
    structuralPenalty: round(quality.structuralPenalty),
    semanticDiagnosticPenalty: round(quality.semanticDiagnosticPenalty),
    metrics: sortNumericRecord(quality.metrics)
  };
}

function createSummary(
  templates: readonly ArchitectureBoardCompilerEvidenceTemplateResult[]
): ArchitectureBoardCompilerEvidenceReport["summary"] {
  const beforeScores = templates.map((template) => template.quality.before.score);
  const afterScores = templates.map((template) => template.quality.after.score);
  const scoreDeltas = templates.map((template) => template.quality.scoreDelta);
  const totalChangeCount = templates.reduce((total, template) => total + template.changes.total, 0);
  const diagnosticCount = templates.reduce(
    (total, template) => total + template.diagnostics.total,
    0
  );

  return {
    availableTemplateCount: templates.length,
    totalChangeCount,
    diagnosticCount,
    changesByKind: sumCountRecords(
      templates.map((template) => template.changes.byKind),
      CHANGE_KIND_ORDER
    ),
    diagnosticsByLevel: sumCountRecords(
      templates.map((template) => template.diagnostics.byLevel),
      DIAGNOSTIC_LEVEL_ORDER
    ),
    meanBeforeScore: mean(beforeScores),
    meanAfterScore: mean(afterScores),
    meanScoreDelta: mean(scoreDeltas),
    visualAnomalies: {
      before: sumVisualAnomalyMetrics(templates, "before"),
      after: sumVisualAnomalyMetrics(templates, "after")
    }
  };
}

function createChangeGroups(
  changes: readonly ArchitectureBoardCompilationProposal["changes"][number][]
): ArchitectureBoardCompilerEvidenceChangeGroup[] {
  const groups = new Map<
    string,
    {
      action: ArchitectureBoardCompilerEvidenceChangeGroup["action"];
      count: number;
      kind: ArchitectureBoardCompilationChangeKind;
      totalCost: number;
    }
  >();

  for (const change of changes) {
    const action = change.action as ArchitectureBoardCompilerEvidenceChangeGroup["action"];
    const key = `${change.kind}:${action}`;
    const current = groups.get(key) ?? { action, kind: change.kind, count: 0, totalCost: 0 };
    current.count += 1;
    current.totalCost += change.cost;
    groups.set(key, current);
  }

  return [...groups.values()].sort(
    (left, right) =>
      CHANGE_KIND_ORDER.indexOf(left.kind) - CHANGE_KIND_ORDER.indexOf(right.kind) ||
      CHANGE_ACTION_ORDER.indexOf(left.action) - CHANGE_ACTION_ORDER.indexOf(right.action)
  );
}

function createDiagnosticSummaries(
  diagnostics: readonly ArchitectureBoardCompilationDiagnostic[]
): ArchitectureBoardCompilerEvidenceDiagnostic[] {
  const summaries = new Map<
    string,
    {
      code: string;
      count: number;
      level: ArchitectureBoardCompilationDiagnosticLevel;
      penalty: number;
      sampleMessage: string;
      summary: string;
    }
  >();

  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.level}:${diagnostic.code}:${diagnostic.summary}`;
    const current = summaries.get(key) ?? {
      code: diagnostic.code,
      level: diagnostic.level,
      summary: diagnostic.summary,
      sampleMessage: diagnostic.message,
      count: 0,
      penalty: 0
    };
    current.count += 1;
    current.penalty += diagnostic.penalty;
    if (diagnostic.message.localeCompare(current.sampleMessage) < 0) {
      current.sampleMessage = diagnostic.message;
    }
    summaries.set(key, current);
  }

  return [...summaries.values()]
    .map((summary) => ({ ...summary, penalty: round(summary.penalty) }))
    .sort(
      (left, right) =>
        DIAGNOSTIC_LEVEL_ORDER.indexOf(left.level) - DIAGNOSTIC_LEVEL_ORDER.indexOf(right.level) ||
        left.code.localeCompare(right.code) ||
        left.summary.localeCompare(right.summary)
    );
}

function countByOrder<T, TKey extends string>(
  values: readonly T[],
  order: readonly TKey[],
  getKey: (value: T) => TKey
): Record<TKey, number> {
  const counts = Object.fromEntries(order.map((key) => [key, 0])) as Record<TKey, number>;

  for (const value of values) {
    const key = getKey(value);
    counts[key] += 1;
  }

  return counts;
}

function sumCountRecords<TKey extends string>(
  records: readonly Readonly<Record<TKey, number>>[],
  order: readonly TKey[]
): Record<TKey, number> {
  const totals = Object.fromEntries(order.map((key) => [key, 0])) as Record<TKey, number>;

  for (const record of records) {
    for (const key of order) {
      totals[key] += record[key] ?? 0;
    }
  }

  return totals;
}

function sumVisualAnomalyMetrics(
  templates: readonly ArchitectureBoardCompilerEvidenceTemplateResult[],
  stage: "before" | "after"
): Record<VisualAnomalyMetricKey, number> {
  const totals = Object.fromEntries(
    ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.map((key) => [key, 0])
  ) as Record<
    VisualAnomalyMetricKey,
    number
  >;

  for (const template of templates) {
    for (const key of ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS) {
      totals[key] += template.quality[stage].metrics[key] ?? 0;
    }
  }

  return Object.fromEntries(
    ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.map((key) => [key, round(totals[key])])
  ) as Record<VisualAnomalyMetricKey, number>;
}

function sortNumericRecord(metrics: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics)
      .filter(([, value]) => Number.isFinite(value))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, round(value)])
  );
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function fingerprintDiagram(diagram: DiagramJson): string {
  const canonicalJson = JSON.stringify(canonicalize(diagram));
  return `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}
