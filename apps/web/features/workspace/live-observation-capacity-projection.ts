import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";

export type LiveObservationCapacityProjection = Readonly<{
  actualCount: number | null;
  direction: "scale_in" | "scale_out" | "steady" | "unknown";
  maxCapacity: number;
  predictedCount: number;
  targetRequestsPerTaskPerMinute: number;
}>;

type RequestScalingEvidence = Readonly<{
  maxCapacity: number;
  minCapacity: number;
  targetValue: number;
}>;

export function getLiveObservationCapacityProjection(
  architecture: ArchitectureJson,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationCapacityProjection | null {
  const evidence = readRequestScalingEvidence(architecture);
  if (!snapshot || !evidence) return null;

  const predictedCount = clamp(
    Math.ceil(snapshot.live.projectedRequestsPerMinute / evidence.targetValue),
    evidence.minCapacity,
    evidence.maxCapacity
  );
  const actualCount = snapshot.latestObservation?.payload.capacity.running ?? null;

  return {
    actualCount,
    direction:
      actualCount === null
        ? "unknown"
        : predictedCount > actualCount
          ? "scale_out"
          : predictedCount < actualCount
            ? "scale_in"
            : "steady",
    maxCapacity: evidence.maxCapacity,
    predictedCount,
    targetRequestsPerTaskPerMinute: evidence.targetValue
  };
}

function readRequestScalingEvidence(
  architecture: ArchitectureJson
): RequestScalingEvidence | null {
  const nodeById = new Map(architecture.nodes.map((node) => [node.id, node]));
  const targets = architecture.nodes.filter(
    (node) => node.type === "APPLICATION_AUTO_SCALING_TARGET"
  );
  if (targets.length !== 1) return null;

  const target = targets[0]!;
  const services = architecture.edges
    .filter((edge) => edge.targetId === target.id)
    .map((edge) => nodeById.get(edge.sourceId))
    .filter((node) => node?.type === "ECS_SERVICE");
  const policies = architecture.edges
    .filter((edge) => edge.sourceId === target.id)
    .map((edge) => nodeById.get(edge.targetId))
    .filter((node) => node?.type === "APPLICATION_AUTO_SCALING_POLICY");
  if (services.length !== 1 || policies.length !== 1) return null;

  const minCapacity = readNonNegativeInteger(target.config["minCapacity"]);
  const maxCapacity = readPositiveInteger(target.config["maxCapacity"]);
  const policy = policies[0]!;
  const tracking = readRecord(policy.config["targetTrackingScalingPolicyConfiguration"]);
  const targetValue = readPositiveNumber(tracking?.["targetValue"]);
  const specifications = normalizeArray(tracking?.["predefinedMetricSpecification"]);
  const specification = specifications.length === 1 ? readRecord(specifications[0]) : null;

  if (
    policy.config["policyType"] !== "TargetTrackingScaling" ||
    minCapacity === null ||
    maxCapacity === null ||
    minCapacity > maxCapacity ||
    targetValue === null ||
    specification?.["predefinedMetricType"] !== "ALBRequestCountPerTarget"
  ) {
    return null;
  }

  return { minCapacity, maxCapacity, targetValue };
}

function normalizeArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
