export const ARCHITECTURE_BOARD_COMPILER_EVIDENCE_BASELINE_VERSION =
  "architecture-board-compiler-evidence-baseline/v1";

export const ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS = [
  "nodeOverlapCount",
  "siblingAreaOverlapCount",
  "parentBoundaryViolationCount",
  "edgeCrossingCount",
  "edgeNodeIntersectionCount",
  "edgeAreaTitleIntersectionCount",
  "backwardEdgeCount",
  "supportLaneIntrusionCount"
] as const;

export type ArchitectureBoardCompilerVisualAnomalyMetricKey =
  (typeof ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS)[number];

export type ArchitectureBoardCompilerEvidenceRegressionBudget = Readonly<
  Record<ArchitectureBoardCompilerVisualAnomalyMetricKey, number>
>;

export type ArchitectureBoardCompilerEvidenceRegressionViolation = {
  readonly actual: number;
  readonly maximum: number;
  readonly metric: ArchitectureBoardCompilerVisualAnomalyMetricKey;
};

export type ArchitectureBoardCompilerEvidenceBaseline = {
  readonly aggregateAfterVisualAnomalyBudget: ArchitectureBoardCompilerEvidenceRegressionBudget;
  readonly baselineVersion: typeof ARCHITECTURE_BOARD_COMPILER_EVIDENCE_BASELINE_VERSION;
  readonly compilerVersion: string;
  readonly recordedRationale: string;
};

export function createArchitectureBoardCompilerEvidenceRegressionBudget(
  values: Readonly<Record<ArchitectureBoardCompilerVisualAnomalyMetricKey, number>>
): ArchitectureBoardCompilerEvidenceRegressionBudget {
  return Object.fromEntries(
    ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.map((metric) => {
      const value = values[metric];
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Evidence regression budget ${metric} must be a non-negative finite number.`);
      }
      return [metric, value];
    })
  ) as ArchitectureBoardCompilerEvidenceRegressionBudget;
}

/**
 * Returns deterministic violations instead of silently moving the baseline. A higher budget must
 * be intentionally committed in the baseline artifact with a review rationale.
 */
export function assertArchitectureBoardCompilerEvidenceRegressionBudget(
  actual: Readonly<Record<ArchitectureBoardCompilerVisualAnomalyMetricKey, number>>,
  budget: ArchitectureBoardCompilerEvidenceRegressionBudget
): readonly ArchitectureBoardCompilerEvidenceRegressionViolation[] {
  return ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.flatMap((metric) => {
    const actualValue = actual[metric];
    const maximum = budget[metric];
    if (!Number.isFinite(actualValue) || actualValue < 0) {
      return [{ metric, actual: actualValue, maximum }];
    }
    return actualValue > maximum ? [{ metric, actual: actualValue, maximum }] : [];
  });
}

export function parseArchitectureBoardCompilerEvidenceBaseline(
  value: unknown
): ArchitectureBoardCompilerEvidenceBaseline {
  const record = asRecord(value);
  if (!record) throw new Error("Architecture Board Compiler evidence baseline must be an object.");
  if (record.baselineVersion !== ARCHITECTURE_BOARD_COMPILER_EVIDENCE_BASELINE_VERSION) {
    throw new Error(
      `Unsupported Architecture Board Compiler evidence baseline version: ${String(record.baselineVersion)}.`
    );
  }
  if (typeof record.compilerVersion !== "string" || record.compilerVersion.length === 0) {
    throw new Error("Architecture Board Compiler evidence baseline needs compilerVersion.");
  }
  if (typeof record.recordedRationale !== "string" || record.recordedRationale.trim().length === 0) {
    throw new Error("Architecture Board Compiler evidence baseline needs recordedRationale.");
  }

  return {
    baselineVersion: ARCHITECTURE_BOARD_COMPILER_EVIDENCE_BASELINE_VERSION,
    compilerVersion: record.compilerVersion,
    recordedRationale: record.recordedRationale,
    aggregateAfterVisualAnomalyBudget: createArchitectureBoardCompilerEvidenceRegressionBudget(
      asRequiredMetricRecord(record.aggregateAfterVisualAnomalyBudget)
    )
  };
}

function asRequiredMetricRecord(
  value: unknown
): Record<ArchitectureBoardCompilerVisualAnomalyMetricKey, number> {
  const record = asRecord(value);
  if (!record) {
    throw new Error("Architecture Board Compiler evidence baseline needs aggregateAfterVisualAnomalyBudget.");
  }

  return Object.fromEntries(
    ARCHITECTURE_BOARD_COMPILER_VISUAL_ANOMALY_METRIC_KEYS.map((metric) => [metric, record[metric]])
  ) as Record<ArchitectureBoardCompilerVisualAnomalyMetricKey, number>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
