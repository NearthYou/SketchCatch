import type {
  LiveObservationPressureLevel,
  LiveObservationSession,
  LiveObservationSnapshot
} from "@sketchcatch/types";

const BOOST_REQUESTS_PER_SECOND = 5;
const BOOST_MAX_DURATION_MS = 90_000;
const BOOST_MAX_REQUESTS = 450;
const BOOST_MAX_CONCURRENCY = 5;
const MAX_VISIBLE_REQUEST_PARTICLES = 5;

export type LiveObservationDeploymentCandidate = {
  readonly id: string;
  readonly status: string;
  readonly liveProfile: string;
  readonly completedAt: string | null;
};

export type PresenterTrafficBoostProgress = {
  readonly attemptedRequests: number;
  readonly successfulTrafficRequests: number;
  readonly acceptedReceipts: number;
  readonly trafficFailures: number;
  readonly receiptFailures: number;
  readonly inFlightRequests: number;
  readonly running: boolean;
};

export type PresenterTrafficBoostController = {
  start(): void;
  stop(): void;
  getProgress(): PresenterTrafficBoostProgress;
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

type IntervalScheduler = {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
};

type PresenterTrafficBoostDependencies = {
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly now?: (() => number) | undefined;
  readonly createEventId?: (() => string) | undefined;
  readonly scheduler?: IntervalScheduler | undefined;
  readonly onProgress?: ((progress: PresenterTrafficBoostProgress) => void) | undefined;
};

export function getEligibleLiveObservationDeployments<
  T extends LiveObservationDeploymentCandidate
>(deployments: readonly T[]): T[] {
  return deployments
    .filter(
      (deployment) =>
        deployment.status === "SUCCESS" &&
        deployment.liveProfile === "demo_web_service" &&
        deployment.completedAt !== null
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? 0).getTime() -
        new Date(left.completedAt ?? 0).getTime()
    );
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
    if (instance.lifecycleState === "InService") {
      return { key: instance.instanceId, label: "InService", state: "in-service" };
    }

    if (/^(?:Warmed:)?Pending/.test(instance.lifecycleState)) {
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

export function createPresenterTrafficBoost(
  session: LiveObservationSession,
  dependencies: PresenterTrafficBoostDependencies = {}
): PresenterTrafficBoostController {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const createEventId = dependencies.createEventId ?? createUuid;
  const scheduler = dependencies.scheduler ?? browserIntervalScheduler;
  const receiptUrl = createReceiptUrl(session.audienceUrl);
  const abortController = new AbortController();
  let intervalHandle: unknown;
  let startedAt: number | null = null;
  let attemptedRequests = 0;
  let successfulTrafficRequests = 0;
  let acceptedReceipts = 0;
  let trafficFailures = 0;
  let receiptFailures = 0;
  let inFlightRequests = 0;
  let running = false;

  const getProgress = (): PresenterTrafficBoostProgress => ({
    acceptedReceipts,
    attemptedRequests,
    inFlightRequests,
    receiptFailures,
    running,
    successfulTrafficRequests,
    trafficFailures
  });
  const notify = () => dependencies.onProgress?.(getProgress());
  const stop = () => {
    if (!running && abortController.signal.aborted) {
      return;
    }

    running = false;
    abortController.abort();
    if (intervalHandle !== undefined) {
      scheduler.clearInterval(intervalHandle);
      intervalHandle = undefined;
    }
    notify();
  };
  const finishIfComplete = () => {
    if (attemptedRequests >= BOOST_MAX_REQUESTS && inFlightRequests === 0) {
      stop();
    }
  };
  const sendTrafficAndReceipt = async () => {
    inFlightRequests += 1;
    notify();

    try {
      let trafficResponse: Response;
      try {
        trafficResponse = await fetchRequest(session.trafficApiUrl, {
          method: "POST",
          signal: abortController.signal
        });
      } catch {
        if (!abortController.signal.aborted) {
          trafficFailures += 1;
        }
        return;
      }

      if (!trafficResponse.ok) {
        trafficFailures += 1;
        return;
      }

      successfulTrafficRequests += 1;
      try {
        const receiptResponse = await fetchRequest(receiptUrl, {
          body: JSON.stringify({ eventId: createEventId() }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: abortController.signal
        });

        if (receiptResponse.ok) {
          acceptedReceipts += 1;
        } else {
          receiptFailures += 1;
        }
      } catch {
        if (!abortController.signal.aborted) {
          receiptFailures += 1;
        }
      }
    } finally {
      inFlightRequests -= 1;
      notify();
      finishIfComplete();
    }
  };
  const dispatchBatch = () => {
    if (!running || startedAt === null) {
      return;
    }

    if (now() - startedAt >= BOOST_MAX_DURATION_MS) {
      stop();
      return;
    }

    const availableConcurrency = BOOST_MAX_CONCURRENCY - inFlightRequests;
    const remainingRequests = BOOST_MAX_REQUESTS - attemptedRequests;
    const batchSize = Math.min(
      BOOST_REQUESTS_PER_SECOND,
      availableConcurrency,
      remainingRequests
    );

    for (let index = 0; index < batchSize; index += 1) {
      attemptedRequests += 1;
      void sendTrafficAndReceipt();
    }

    finishIfComplete();
  };

  return {
    getProgress,
    start() {
      if (running || abortController.signal.aborted) {
        return;
      }

      running = true;
      startedAt = now();
      intervalHandle = scheduler.setInterval(dispatchBatch, 1_000);
      dispatchBatch();
      notify();
    },
    stop
  };
}

function createReceiptUrl(audienceUrl: string): string {
  const url = new URL(audienceUrl);
  const token = url.searchParams.get("observation");
  const collector = url.searchParams.get("collector");

  if (!token || !collector) {
    throw new Error("Live Observation audience URL is missing collector metadata");
  }

  return `${collector.replace(/\/+$/, "")}/api/live-observations/public/${encodeURIComponent(token)}/events`;
}

function createUuid(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure UUID generation is unavailable");
  }

  return globalThis.crypto.randomUUID();
}

const browserIntervalScheduler: IntervalScheduler = {
  clearInterval(handle) {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
  },
  setInterval(callback, delayMs) {
    return globalThis.setInterval(callback, delayMs);
  }
};
