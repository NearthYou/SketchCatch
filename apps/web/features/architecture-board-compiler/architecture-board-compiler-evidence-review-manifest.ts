import type {
  ArchitectureBoardCompilerEvidenceReport,
  ArchitectureBoardCompilerEvidenceTemplateResult
} from "./architecture-board-compiler-evidence-report";
import { ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS } from "./architecture-board-compiler-evidence-baseline";

export const ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REVIEW_MANIFEST_VERSION =
  "architecture-board-compiler-evidence-review/v1";

export const ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REVIEW_CAPTURE_ROOT =
  "docs/diagram-layout-reference/compiler-evidence-captures/v1";

const TARGET_REVIEW_COUNT = 8;
const SOURCE_ORDER = ["repository", "brainboard"] as const;
const SOURCE_QUOTAS = {
  repository: 3,
  brainboard: 5
} as const;

type EvidenceSource = ArchitectureBoardCompilerEvidenceTemplateResult["source"];

type ReviewQuality = {
  readonly metrics: Readonly<Record<string, number>>;
  readonly score: number;
  readonly semanticDiagnosticPenalty: number;
  readonly structuralPenalty: number;
  readonly visualPenalty: number;
};

export type ArchitectureBoardCompilerEvidenceReviewManifest = {
  readonly compilerVersion: string;
  readonly entries: readonly ArchitectureBoardCompilerEvidenceReviewEntry[];
  readonly reportVersion: string;
  readonly reviewManifestVersion: typeof ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REVIEW_MANIFEST_VERSION;
  readonly selection: {
    readonly policy: "source-balanced-risk-priority/v1";
    readonly selectedBySource: Readonly<Record<EvidenceSource, number>>;
    readonly targetCount: number;
  };
  readonly summary: {
    readonly completedCount: 0;
    readonly pendingCount: number;
    readonly selectedCount: number;
    readonly status: "pending";
  };
};

export type ArchitectureBoardCompilerEvidenceReviewEntry = {
  readonly captures: {
    readonly after: ArchitectureBoardCompilerEvidenceReviewExpectedCapture;
    readonly before: ArchitectureBoardCompilerEvidenceReviewExpectedCapture;
  };
  readonly id: string;
  readonly diagrams: {
    readonly compiledFingerprint: string;
    readonly sourceFingerprint: string;
  };
  readonly metrics: {
    readonly after: ReviewQuality;
    readonly before: ReviewQuality;
    readonly compilationDistance: number;
    readonly scoreDelta: number;
  };
  readonly proposal: {
    readonly candidateId: string;
    readonly compilerVersion: string;
  };
  readonly review: {
    readonly decision: null;
    readonly rationale: null;
    readonly reviewer: null;
    readonly status: "pending";
  };
  readonly source: EvidenceSource;
  readonly title: string;
};

export type ArchitectureBoardCompilerEvidenceReviewExpectedCapture = {
  readonly expectedPath: string;
  readonly state: "expected";
};

/**
 * 사람 검토를 대신하지 않는 deterministic queue다. 실제 WebP 파일 존재나 사람의 판정은
 * 여기서 검증하지 않는다. 그것들은 명시적인 캡처/리뷰 작업이 남아 있다는 의미다.
 */
export function createArchitectureBoardCompilerEvidenceReviewManifest(
  report: ArchitectureBoardCompilerEvidenceReport
): ArchitectureBoardCompilerEvidenceReviewManifest {
  validateEvidenceReport(report);
  const selectedTemplates = selectReviewTemplates(report.templates);
  const entries = selectedTemplates.map(createReviewEntry);

  return {
    reviewManifestVersion: ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REVIEW_MANIFEST_VERSION,
    reportVersion: report.reportVersion,
    compilerVersion: report.compilerVersion,
    selection: {
      policy: "source-balanced-risk-priority/v1",
      targetCount: TARGET_REVIEW_COUNT,
      selectedBySource: countSelectedBySource(entries)
    },
    summary: {
      status: "pending",
      selectedCount: entries.length,
      pendingCount: entries.length,
      completedCount: 0
    },
    entries
  };
}

export function renderArchitectureBoardCompilerEvidenceReviewManifest(
  manifest: ArchitectureBoardCompilerEvidenceReviewManifest
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function selectReviewTemplates(
  templates: readonly ArchitectureBoardCompilerEvidenceTemplateResult[]
): readonly ArchitectureBoardCompilerEvidenceTemplateResult[] {
  const ranked = [...templates].sort(compareRiskPriority);
  const selected: ArchitectureBoardCompilerEvidenceTemplateResult[] = [];
  const selectedIds = new Set<string>();

  for (const source of SOURCE_ORDER) {
    const quota = SOURCE_QUOTAS[source];
    const matching = ranked.filter((template) => template.source === source).slice(0, quota);

    for (const template of matching) {
      selected.push(template);
      selectedIds.add(template.id);
    }
  }

  for (const template of ranked) {
    if (selected.length >= Math.min(TARGET_REVIEW_COUNT, ranked.length)) break;
    if (selectedIds.has(template.id)) continue;
    selected.push(template);
    selectedIds.add(template.id);
  }

  return selected.sort(
    (left, right) =>
      SOURCE_ORDER.indexOf(left.source) - SOURCE_ORDER.indexOf(right.source) ||
      compareRiskPriority(left, right)
  );
}

function compareRiskPriority(
  left: ArchitectureBoardCompilerEvidenceTemplateResult,
  right: ArchitectureBoardCompilerEvidenceTemplateResult
): number {
  return (
    visualAnomalyRegression(right) - visualAnomalyRegression(left) ||
    right.diagnostics.total - left.diagnostics.total ||
    right.changes.total - left.changes.total ||
    Math.abs(right.quality.scoreDelta) - Math.abs(left.quality.scoreDelta) ||
    left.id.localeCompare(right.id)
  );
}

function visualAnomalyRegression(template: ArchitectureBoardCompilerEvidenceTemplateResult): number {
  return ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.reduce(
    (total, metric) =>
      total + Math.max(0, (template.quality.after.metrics[metric] ?? 0) - (template.quality.before.metrics[metric] ?? 0)),
    0
  );
}

function createReviewEntry(
  template: ArchitectureBoardCompilerEvidenceTemplateResult
): ArchitectureBoardCompilerEvidenceReviewEntry {
  const captureDirectory = `${ARCHITECTURE_BOARD_COMPILER_EVIDENCE_REVIEW_CAPTURE_ROOT}/${toCaptureDirectoryName(template.id)}`;

  return {
    id: template.id,
    title: template.title,
    source: template.source,
    captures: {
      before: { state: "expected", expectedPath: `${captureDirectory}/before.webp` },
      after: { state: "expected", expectedPath: `${captureDirectory}/after.webp` }
    },
    diagrams: {
      sourceFingerprint: template.diagramFingerprints.source,
      compiledFingerprint: template.diagramFingerprints.compiled
    },
    proposal: {
      compilerVersion: template.compilerVersion,
      candidateId: template.candidateId
    },
    metrics: {
      before: copyQuality(template.quality.before),
      after: copyQuality(template.quality.after),
      compilationDistance: template.quality.compilationDistance,
      scoreDelta: template.quality.scoreDelta
    },
    review: {
      status: "pending",
      reviewer: null,
      decision: null,
      rationale: null
    }
  };
}

function copyQuality(
  quality: ArchitectureBoardCompilerEvidenceTemplateResult["quality"]["before"]
): ReviewQuality {
  return {
    score: quality.score,
    visualPenalty: quality.visualPenalty,
    structuralPenalty: quality.structuralPenalty,
    semanticDiagnosticPenalty: quality.semanticDiagnosticPenalty,
    metrics: Object.fromEntries(
      Object.entries(quality.metrics).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

function countSelectedBySource(
  entries: readonly ArchitectureBoardCompilerEvidenceReviewEntry[]
): Record<EvidenceSource, number> {
  return Object.fromEntries(
    SOURCE_ORDER.map((source) => [
      source,
      entries.filter((entry) => entry.source === source).length
    ])
  ) as Record<EvidenceSource, number>;
}

function toCaptureDirectoryName(templateId: string): string {
  return templateId.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "");
}

function validateEvidenceReport(report: ArchitectureBoardCompilerEvidenceReport): void {
  if (report.summary.availableTemplateCount !== report.templates.length) {
    throw new Error(
      "Architecture Board Compiler evidence review manifest requires a report whose availableTemplateCount matches templates."
    );
  }

  const templateIds = new Set<string>();

  for (const template of report.templates) {
    if (templateIds.has(template.id)) {
      throw new Error(`Architecture Board Compiler evidence review manifest found duplicate template ID: ${template.id}`);
    }
    templateIds.add(template.id);
  }
}
