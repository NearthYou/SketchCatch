import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilerEvidenceReport } from "./architecture-board-compiler-evidence-report";
import {
  createArchitectureBoardCompilerEvidenceReport
} from "./architecture-board-compiler-evidence-report";
import {
  createArchitectureBoardCompilerEvidenceReviewManifest,
  renderArchitectureBoardCompilerEvidenceReviewManifest
} from "./architecture-board-compiler-evidence-review-manifest";
import { collectArchitectureBoardCompilerEvidenceInput } from "./architecture-board-compiler-evidence-source";

test("evidence review manifest는 29개 corpus에서 source-balanced 8개 pending 사람 검토 항목을 결정론적으로 만든다", () => {
  const report = createArchitectureBoardCompilerEvidenceReport(
    collectArchitectureBoardCompilerEvidenceInput()
  );

  const first = createArchitectureBoardCompilerEvidenceReviewManifest(report);
  const second = createArchitectureBoardCompilerEvidenceReviewManifest(report);

  assert.deepEqual(first, second);
  assert.equal(first.entries.length, 8);
  assert.deepEqual(first.summary, {
    completedCount: 0,
    pendingCount: 8,
    selectedCount: 8,
    status: "pending"
  });
  assert.deepEqual(
    Object.fromEntries(
      ["repository", "brainboard"].map((source) => [
        source,
        first.entries.filter((entry) => entry.source === source).length
      ])
    ),
    { repository: 3, brainboard: 5 }
  );

  for (const entry of first.entries) {
    assert.equal(entry.review.status, "pending");
    assert.equal(entry.review.reviewer, null);
    assert.equal(entry.review.decision, null);
    assert.equal(entry.review.rationale, null);
    assert.match(
      entry.captures.before.expectedPath,
      /^apps\/web\/test-fixtures\/architecture-board-layout\/compiler-evidence-captures\/v1\//u
    );
    assert.match(entry.captures.before.expectedPath, /\/before\.webp$/u);
    assert.match(entry.captures.after.expectedPath, /\/after\.webp$/u);
    assert.match(entry.diagrams.sourceFingerprint, /^sha256:[0-9a-f]{64}$/u);
    assert.match(entry.diagrams.compiledFingerprint, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(entry.proposal.compilerVersion, report.compilerVersion);
    assert.ok(entry.proposal.candidateId.startsWith("compiled:"));
    assert.equal(typeof entry.metrics.before.score, "number");
    assert.equal(typeof entry.metrics.after.score, "number");
  }

  assert.equal(
    renderArchitectureBoardCompilerEvidenceReviewManifest(first),
    renderArchitectureBoardCompilerEvidenceReviewManifest(second)
  );
});

test("evidence review manifest는 canvas 크기 증가보다 실제 visual anomaly 회귀를 먼저 사람 검토에 올린다", () => {
  const report = createSyntheticEvidenceReport([
    createSyntheticTemplate("repository:edge-regression", {
      afterMetrics: { canvasArea: 100, edgeCrossingCount: 1 },
      beforeMetrics: { canvasArea: 100, edgeCrossingCount: 0 }
    }),
    ...Array.from({ length: 8 }, (_, index) =>
      createSyntheticTemplate(`repository:canvas-growth-${index + 1}`, {
        afterMetrics: { canvasArea: 1_000_000 + index, edgeCrossingCount: 0 },
        beforeMetrics: { canvasArea: 100, edgeCrossingCount: 0 }
      })
    )
  ]);

  const manifest = createArchitectureBoardCompilerEvidenceReviewManifest(report);

  assert.equal(manifest.entries[0]?.id, "repository:edge-regression");
});

function createSyntheticEvidenceReport(
  templates: readonly ReturnType<typeof createSyntheticTemplate>[]
): ArchitectureBoardCompilerEvidenceReport {
  return {
    compilerVersion: "architecture-board-compiler/v3",
    reportVersion: "architecture-board-compiler-evidence-report/v1",
    summary: { availableTemplateCount: templates.length },
    templates
  } as unknown as ArchitectureBoardCompilerEvidenceReport;
}

function createSyntheticTemplate(
  id: string,
  {
    afterMetrics,
    beforeMetrics
  }: {
    readonly afterMetrics: Readonly<Record<string, number>>;
    readonly beforeMetrics: Readonly<Record<string, number>>;
  }
) {
  const quality = (metrics: Readonly<Record<string, number>>) => ({
    metrics,
    score: 1,
    semanticDiagnosticPenalty: 0,
    structuralPenalty: 0,
    visualPenalty: 0
  });

  return {
    candidateId: "compiled:presentation:default",
    changes: { total: 0 },
    compilerVersion: "architecture-board-compiler/v3",
    diagramFingerprints: {
      source: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      compiled: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    diagnostics: { total: 0 },
    id,
    quality: {
      after: quality(afterMetrics),
      before: quality(beforeMetrics),
      compilationDistance: 0,
      scoreDelta: 0
    },
    source: "repository" as const,
    title: id
  };
}
