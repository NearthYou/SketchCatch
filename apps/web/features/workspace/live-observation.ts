import type {
  LiveObservationPressureLevel,
  LiveObservationProviderSnapshot,
  LiveObservationSnapshot,
  LiveObservationV2Session
} from "@sketchcatch/types";

const MAX_VISIBLE_REQUEST_PARTICLES = 5;

export type LiveObservationDeploymentCandidate = {
  readonly id: string;
  readonly status: string;
  readonly completedAt: string | null;
};

export type LiveObservationInstanceMarker = {
  readonly key: string;
  readonly label: string;
  readonly state: "in-service" | "launching" | "transitioning";
};

export type LiveObservationRequestBurst = {
  readonly overflowCount: number;
  readonly visibleParticleCount: number;
};

export function getLiveObservationPressureLabel(
  level: LiveObservationPressureLevel
): string {
  switch (level) {
    case "normal":
      return "정상";
    case "warning":
      return "요청 증가";
    case "high":
      return "Scale-out 예상";
    case "critical":
      return "포화 임박";
  }
}

export function getLiveObservationProviderEvidence(
  snapshot: LiveObservationProviderSnapshot
): {
  stateLabel: string;
  requests: string;
  errorRate: string;
  p95Latency: string;
  availability: string;
  capacity: string;
} {
  if (snapshot.state !== "available") {
    return {
      stateLabel: snapshot.state === "delayed" ? "지연" : "사용 불가",
      requests: "—",
      errorRate: "—",
      p95Latency: "—",
      availability: "—",
      capacity: "—"
    };
  }

  return {
    stateLabel: "정상",
    requests: String(snapshot.requests),
    errorRate: `${snapshot.errorRate}%`,
    p95Latency: `${snapshot.p95LatencyMs}ms`,
    availability: `${snapshot.availability}%`,
    capacity: `${snapshot.capacity.healthy} / ${snapshot.capacity.running} / ${snapshot.capacity.max}`
  };
}
export function getEligibleLiveObservationDeployments<
  T extends LiveObservationDeploymentCandidate
>(deployments: readonly T[]): T[] {
  return deployments
    .filter(
      (deployment) =>
        deployment.status === "SUCCESS" &&
        deployment.completedAt !== null
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? 0).getTime() -
        new Date(left.completedAt ?? 0).getTime()
    );
}

export function getLiveObservationAudienceUrl(
  session: LiveObservationV2Session
): string | null {
  try {
    const url = new URL(session.audienceUrl);
    const expectedPath = `/observe/${encodeURIComponent(session.id)}`;
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== expectedPath ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return `${url.origin}${expectedPath}`;
  } catch {
    return null;
  }
}

export function getLiveObservationRequestBurst(
  previousAcceptedEventCount: number | null,
  nextAcceptedEventCount: number,
  hasActualInServiceInstance: boolean
): LiveObservationRequestBurst | null {
  if (
    !hasActualInServiceInstance ||
    previousAcceptedEventCount === null ||
    nextAcceptedEventCount <= previousAcceptedEventCount
  ) {
    return null;
  }

  const delta = nextAcceptedEventCount - previousAcceptedEventCount;

  return {
    overflowCount: Math.max(0, delta - MAX_VISIBLE_REQUEST_PARTICLES),
    visibleParticleCount: Math.min(delta, MAX_VISIBLE_REQUEST_PARTICLES)
  };
}

export function getLiveObservationRequestTargetIndexes(
  visibleParticleCount: number,
  inServiceInstanceCount: number,
  burstSequence: number
): number[] {
  const targetCount = Math.min(2, Math.max(0, Math.floor(inServiceInstanceCount)));

  if (targetCount === 0 || visibleParticleCount <= 0) {
    return [];
  }

  const startingIndex = Math.max(0, burstSequence - 1) % targetCount;

  return Array.from(
    { length: visibleParticleCount },
    (_, index) => (startingIndex + index) % targetCount
  );
}

export function getLiveObservationInstanceMarkers(
  snapshot: LiveObservationSnapshot | null
): LiveObservationInstanceMarker[] {
  if (!snapshot || snapshot.capacity.state === "unavailable") {
    return [];
  }

  const markers: LiveObservationInstanceMarker[] = snapshot.capacity.instances.map((instance) => {
    if (instance.lifecycleState === "InService" || instance.lifecycleState === "RUNNING") {
      return { key: instance.instanceId, label: instance.lifecycleState, state: "in-service" };
    }

    if (/^(?:(?:Warmed:)?Pending|PROVISIONING|PENDING)$/.test(instance.lifecycleState)) {
      return { key: instance.instanceId, label: "Launching", state: "launching" };
    }

    return {
      key: instance.instanceId,
      label: instance.lifecycleState,
      state: "transitioning"
    };
  });
  const maxCapacity = snapshot.capacity.maxCapacity ?? 2;

  if (markers.length >= maxCapacity || markers.some((marker) => marker.state === "launching")) {
    return markers;
  }

  const desiredCapacity = snapshot.capacity.desiredCapacity ?? markers.length;
  const activityStatus = snapshot.capacity.latestActivity?.statusCode;
  const activityInProgress =
    activityStatus !== undefined &&
    !["Successful", "Failed", "Cancelled"].includes(activityStatus);

  if (desiredCapacity > markers.length || activityInProgress) {
    markers.push({ key: "launching", label: "Launching", state: "launching" });
  } else if (snapshot.live.pressureLevel === "critical") {
    markers.push({
      key: "scale-out-expected",
      label: "Scale-out expected",
      state: "launching"
    });
  }

  return markers;
}
