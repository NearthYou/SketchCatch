import type {
  LiveObservationSnapshot,
  LiveObservationV2Session,
  TerraformOutput
} from "@sketchcatch/types";

export type LiveObservationDeploymentCandidate = {
  readonly id: string;
  readonly status: string;
  readonly completedAt: string | null;
};

export type LiveObservationReleaseCandidate = {
  readonly deploymentId: string | null;
  readonly status: string;
  readonly outputUrl: string | null;
  readonly completedAt: string | null;
};

export type LiveObservationSelection = {
  readonly runId: string;
  readonly deploymentId: string;
  readonly outputUrl: string;
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

export function getEligibleLiveObservationDeployments<T extends LiveObservationDeploymentCandidate>(
  deployments: readonly T[]
): T[] {
  return deployments
    .filter(
      (deployment) =>
        ["SUCCESS", "PARTIALLY_FAILED", "PARTIALLY_CANCELED"].includes(deployment.status) &&
        deployment.completedAt !== null
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime()
    );
}

export function getLiveObservationOutputUrl(
  deploymentId: string,
  releases: readonly LiveObservationReleaseCandidate[],
  terraformOutputs: readonly TerraformOutput[] = []
): string | null {
  const candidates = releases
    .filter(
      (release) =>
        release.deploymentId === deploymentId &&
        [
          "succeeded",
          "rolled_back",
          "retrying",
          "partially_failed",
          "partially_cancelled"
        ].includes(release.status) &&
        release.completedAt !== null
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime()
    );

  for (const release of candidates) {
    if (!release.outputUrl) continue;

    try {
      const url = new URL(release.outputUrl);
      if (
        url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.search === "" &&
        url.hash === ""
      ) {
        return url.toString();
      }
    } catch {
      // Ignore malformed release output URLs and continue to an older valid release.
    }
  }

  const outputNames = ["cloudfronturl", "staticsiteurl", "apibaseurl"] as const;
  for (const outputName of outputNames) {
    const output = terraformOutputs.find(
      (candidate) =>
        candidate.deploymentId === deploymentId &&
        !candidate.sensitive &&
        candidate.name.replaceAll("_", "").toLowerCase() === outputName &&
        typeof candidate.value === "string"
    );
    if (output && typeof output.value === "string") {
      const normalized = normalizeLiveObservationOutputUrl(output.value);
      if (normalized) return normalized;
    }
  }

  return null;
}

export function getSelectedLiveObservationOutputUrl(
  selection: LiveObservationSelection | null | undefined,
  deploymentId: string,
  releases: readonly LiveObservationReleaseCandidate[],
  terraformOutputs: readonly TerraformOutput[] = []
): string | null {
  if (!selection) {
    return getLiveObservationOutputUrl(deploymentId, releases, terraformOutputs);
  }
  if (selection.deploymentId !== deploymentId) {
    return null;
  }
  return normalizeLiveObservationOutputUrl(selection.outputUrl);
}

export function normalizeLiveObservationOutputUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getLiveObservationAudienceUrl(session: LiveObservationV2Session): string | null {
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
    activityStatus !== undefined && !["Successful", "Failed", "Cancelled"].includes(activityStatus);

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
