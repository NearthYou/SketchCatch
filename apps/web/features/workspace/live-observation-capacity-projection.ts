import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import { recoverLiveObservationReferenceEdges } from "./live-observation-architecture";

const LIVE_OBSERVATION_ACCEPTED_REQUESTS_PER_FORECAST_TASK = 500;

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

export type LiveObservationEffectiveTraffic = Readonly<{
  pressureLevel: LiveObservationV2Snapshot["live"]["pressureLevel"];
  pressurePercent: number;
  projectedRequestsPerMinute: number;
}>;

/** Uses the freshest one-minute request evidence, whether it came from the Store or CloudWatch. */
export function getLiveObservationEffectiveTraffic(
  architecture: ArchitectureJson | null,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationEffectiveTraffic {
  if (!snapshot) {
    return {
      pressureLevel: "normal",
      pressurePercent: 0,
      projectedRequestsPerMinute: 0
    };
  }

  const providerSnapshot = snapshot.latestObservation?.payload;
  const providerRequestsPerMinute =
    providerSnapshot &&
    providerSnapshot.state !== "unavailable" &&
    providerSnapshot.requests !== null
      ? providerSnapshot.requests
      : 0;
  const projectedRequestsPerMinute = Math.max(
    snapshot.live.projectedRequestsPerMinute,
    providerRequestsPerMinute
  );
  const evidence = architecture
    ? readRequestScalingEvidence(recoverLiveObservationReferenceEdges(architecture))
    : null;
  const runningTaskCount = providerSnapshot?.capacity.running;
  const observedTaskCount =
    runningTaskCount !== null && runningTaskCount !== undefined && runningTaskCount > 0
      ? runningTaskCount
      : 1;
  const providerPressurePercent = evidence
    ? roundMetric(
        (providerRequestsPerMinute / (evidence.targetValue * observedTaskCount)) * 100
      )
    : 0;
  const pressurePercent = Math.max(snapshot.live.pressurePercent, providerPressurePercent);

  return {
    pressureLevel: getPressureLevel(pressurePercent),
    pressurePercent,
    projectedRequestsPerMinute
  };
}

export function getLiveObservationCapacityProjection(
  architecture: ArchitectureJson,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationCapacityProjection | null {
  if (!snapshot) return null;

  const evidence = readRequestScalingEvidence(recoverLiveObservationReferenceEdges(architecture));
  if (!evidence) return null;

  const trafficProjectedCount = Math.ceil(
    getLiveObservationEffectiveTraffic(architecture, snapshot).projectedRequestsPerMinute /
      evidence.targetValue
  );
  const acceptedRequestProjectedCount =
    evidence.minCapacity +
    Math.floor(
      snapshot.live.acceptedEventCount /
        LIVE_OBSERVATION_ACCEPTED_REQUESTS_PER_FORECAST_TASK
    );
  const predictedCount = clamp(
    Math.max(trafficProjectedCount, acceptedRequestProjectedCount),
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

function getPressureLevel(
  pressurePercent: number
): LiveObservationV2Snapshot["live"]["pressureLevel"] {
  if (pressurePercent >= 100) return "critical";
  if (pressurePercent >= 70) return "high";
  if (pressurePercent >= 40) return "warning";
  return "normal";
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
