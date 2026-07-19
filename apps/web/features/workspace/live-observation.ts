import type {
  LiveObservationPressureLevel,
  LiveObservationProviderSnapshot,
  LiveObservationSnapshot,
  LiveObservationV2Session,
  LiveObservationV2Snapshot,
  TerraformOutput
} from "@sketchcatch/types";

const MAX_VISIBLE_REQUEST_PARTICLES = 5;

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

export type LiveObservationTrafficCursor = {
  readonly acceptedEventCount: number;
  readonly observationId: string;
  readonly providerObservedAt: string | null;
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
  snapshot: LiveObservationProviderSnapshot,
  capacityModeLabel: "고정 용량" | "Auto Scaling"
): {
  stateLabel: string;
  requests: string;
  errorRate: string;
  p95Latency: string;
  availability: string;
  capacity: string;
  capacityModeLabel: "고정 용량" | "Auto Scaling";
  capacityDetailLabel: "정상 / 실행 / 희망" | "정상 / 실행 / 최대";
} {
  const fixedCapacity = capacityModeLabel === "고정 용량";
  const unavailable = snapshot.state === "unavailable";
  const capacity = fixedCapacity
    ? `${formatProviderNumber(snapshot.capacity.healthy)} / ${formatProviderNumber(snapshot.capacity.running)} / ${formatProviderNumber(snapshot.capacity.desired)}`
    : `${formatProviderNumber(snapshot.capacity.healthy)} / ${formatProviderNumber(snapshot.capacity.running)} / ${formatProviderNumber(snapshot.capacity.max)}`;

  return {
    stateLabel:
      snapshot.state === "available"
        ? "정상"
        : snapshot.state === "delayed"
          ? "지연"
          : "사용 불가",
    requests: unavailable ? "—" : formatProviderNumber(snapshot.requests),
    errorRate: unavailable ? "—" : formatProviderNumber(snapshot.errorRate, "%"),
    p95Latency: unavailable ? "—" : formatProviderNumber(snapshot.p95LatencyMs, "ms"),
    availability: unavailable ? "—" : formatProviderNumber(snapshot.availability, "%"),
    capacity: unavailable ? "—" : capacity,
    capacityModeLabel,
    capacityDetailLabel: fixedCapacity ? "정상 / 실행 / 희망" : "정상 / 실행 / 최대"
  };
}

export type LiveObservationOperationalAnalysis = {
  readonly state: "awaiting" | "healthy" | "bottleneck" | "incident";
  readonly stateLabel: string;
  readonly stateDetail: string;
  readonly capacity: string;
  readonly scaleEventCount: number;
  readonly unhealthyTaskCount: number | null;
  readonly bottleneckDetail: string;
  readonly costImpact: string;
  readonly costDetail: string;
  readonly terraformAction: string;
  readonly terraformDetail: string;
};

export function getLiveObservationOperationalAnalysis(
  snapshot: LiveObservationProviderSnapshot | null,
  pressureLevel: LiveObservationPressureLevel
): LiveObservationOperationalAnalysis {
  if (!snapshot) {
    return {
      state: "awaiting",
      stateLabel: "관측 대기",
      stateDetail: "관측을 시작하면 정상·병목·장애 상태를 판정합니다.",
      capacity: "— / — / —",
      scaleEventCount: 0,
      unhealthyTaskCount: null,
      bottleneckDetail: "오류율·p95·Task 상태 수집 대기",
      costImpact: "산정 대기",
      costDetail: "Task CPU·메모리와 실제 가동시간을 연결해 계산합니다.",
      terraformAction: "관측 데이터 수집 후 생성",
      terraformDetail: "근거가 생기기 전에는 Terraform 변경을 제안하지 않습니다."
    };
  }

  const hasProviderEvidence = [
    snapshot.requests,
    snapshot.errorRate,
    snapshot.p95LatencyMs,
    snapshot.availability,
    snapshot.capacity.desired,
    snapshot.capacity.running,
    snapshot.capacity.healthy,
    snapshot.capacity.max
  ].some((value) => value !== null);

  if (snapshot.state === "unavailable" || !hasProviderEvidence) {
    return {
      state: "awaiting",
      stateLabel: snapshot.state === "unavailable" ? "지표 수집 불가" : "관측 지연",
      stateDetail: "Provider 지표가 확인될 때까지 인프라 상태를 판정하지 않습니다.",
      capacity: "— / — / —",
      scaleEventCount: 0,
      unhealthyTaskCount: null,
      bottleneckDetail: "오류율·p95·Task 상태 확인 대기",
      costImpact: "산정 대기",
      costDetail: "실제 Task 용량과 가동시간이 확인된 뒤 계산합니다.",
      terraformAction: "관측 데이터 복구 후 생성",
      terraformDetail: "수집 실패만으로 Terraform 변경을 제안하지 않습니다."
    };
  }

  const { desired, healthy, max, running } = snapshot.capacity;
  const unhealthyTaskCount =
    running === null || healthy === null ? null : Math.max(0, running - healthy);
  const hasIncident =
    (unhealthyTaskCount ?? 0) > 0 ||
    (snapshot.errorRate ?? 0) >= 5 ||
    (snapshot.availability !== null && snapshot.availability < 95);
  const hasBottleneck =
    !hasIncident &&
    (["high", "critical"].includes(pressureLevel) ||
      (snapshot.errorRate ?? 0) >= 1 ||
      (snapshot.p95LatencyMs ?? 0) >= 1_000 ||
      (snapshot.availability !== null && snapshot.availability < 99));
  const state = hasIncident ? "incident" : hasBottleneck ? "bottleneck" : "healthy";
  const stateLabel = hasIncident ? "장애" : hasBottleneck ? "병목" : "정상";
  const scaleEventCount = snapshot.logs.filter((entry) =>
    /scal(?:e|ed|ing)|desired\s*(?:count|capacity)|capacity/i.test(entry.message)
  ).length;
  const costMultiplier =
    running !== null && running > 0 && max !== null && max > running
      ? `${(max / running).toFixed(1)}×`
      : null;
  const bottleneckDetail = [
    `오류율 ${formatProviderNumber(snapshot.errorRate, "%")}`,
    `p95 ${formatProviderNumber(snapshot.p95LatencyMs, "ms")}`,
    `unhealthy Task ${formatProviderNumber(unhealthyTaskCount)}`
  ].join(" · ");

  let terraformAction = "Terraform 변경 없음";
  let terraformDetail = "현재 관측 구간에는 설정 변경을 뒷받침할 근거가 없습니다.";
  if (hasIncident && (unhealthyTaskCount ?? 0) > 0) {
    terraformAction = "aws_ecs_service.health_check_grace_period_seconds 검토";
    terraformDetail = "Task 시작 실패 원인을 로그에서 확인한 뒤 grace period 변경안을 생성합니다.";
  } else if (hasIncident) {
    terraformAction = "aws_lb_target_group.health_check 검토";
    terraformDetail = "5xx와 가용성 저하 구간을 기준으로 interval·timeout 변경안을 생성합니다.";
  } else if (hasBottleneck && max !== null && desired !== null && desired >= max) {
    terraformAction = `aws_appautoscaling_target.max_capacity = ${max + Math.max(1, Math.ceil(max * 0.25))}`;
    terraformDetail = "현재 max 도달이 확인된 경우에만 약 25% 확장안을 검토합니다.";
  } else if (hasBottleneck) {
    terraformAction = "aws_appautoscaling_policy.target_value 검토";
    terraformDetail = "관측된 처리량과 지연을 기준으로 target value 변경안을 생성합니다.";
  }

  return {
    state,
    stateLabel,
    stateDetail:
      snapshot.state === "delayed"
        ? "Provider 지표가 지연되어 마지막 수집값으로 판정했습니다."
        : "브라우저 요청과 Provider 지표를 같은 관측 구간으로 판정했습니다.",
    capacity: `${formatProviderNumber(running)} / ${formatProviderNumber(desired)} / ${formatProviderNumber(max)}`,
    scaleEventCount,
    unhealthyTaskCount,
    bottleneckDetail,
    costImpact:
      running === null
        ? "산정 대기"
        : max !== null
          ? `${running} Task 현재 · 최대 ${max} Task${costMultiplier ? ` (${costMultiplier})` : ""}`
          : `${running} Task 실행 용량`,
    costDetail: "정확한 금액은 Task CPU·메모리·리전 단가와 가동시간 연결 후 산정합니다.",
    terraformAction,
    terraformDetail
  };
}

function formatProviderNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}
export function getEligibleLiveObservationDeployments<
  T extends LiveObservationDeploymentCandidate
>(deployments: readonly T[]): T[] {
  return deployments
    .filter(
      (deployment) =>
        ["SUCCESS", "PARTIALLY_FAILED", "PARTIALLY_CANCELED"].includes(
          deployment.status
        ) &&
        deployment.completedAt !== null
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt ?? 0).getTime() -
        new Date(left.completedAt ?? 0).getTime()
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
        new Date(right.completedAt ?? 0).getTime() -
        new Date(left.completedAt ?? 0).getTime()
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

export function getLiveObservationTrafficCursor(
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationTrafficCursor | null {
  if (!snapshot) return null;

  return {
    acceptedEventCount: snapshot.live.acceptedEventCount,
    observationId: snapshot.observationId,
    providerObservedAt: snapshot.latestObservation?.observedAt ?? null
  };
}

export function getLiveObservationTrafficBurst(
  previous: LiveObservationTrafficCursor | null,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationRequestBurst | null {
  if (!previous || !snapshot || previous.observationId !== snapshot.observationId) {
    return null;
  }

  const provider = snapshot.latestObservation;
  const runningCount = provider?.payload.capacity.running ?? 0;
  const acceptedDelta = Math.max(
    0,
    snapshot.live.acceptedEventCount - previous.acceptedEventCount
  );
  const providerRequestCount =
    provider &&
    provider.observedAt !== previous.providerObservedAt &&
    provider.payload.state !== "unavailable"
      ? Math.max(0, Math.floor(provider.payload.requests ?? 0))
      : 0;
  const detectedRequestCount = Math.max(acceptedDelta, providerRequestCount);

  return getLiveObservationRequestBurst(0, detectedRequestCount, runningCount > 0);
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
