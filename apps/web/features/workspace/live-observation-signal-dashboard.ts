import type {
  Deployment,
  LiveObservationProviderSnapshot,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import {
  groupLiveObservationLogs,
  type LiveObservationLogGroup
} from "./live-observation-log-groups";
import type {
  LiveObservationSessionHistorySample,
  LiveObservationSignalHistoryMetric
} from "./live-observation-session-history";

export type LiveObservationSignalStatus =
  | "normal"
  | "warning"
  | "critical"
  | "checking"
  | "unknown";

export type LiveObservationDataKind = "actual" | "derived" | "inferred" | "unknown";

export type LiveObservationEvidenceKind = Extract<LiveObservationDataKind, "actual" | "derived">;

export type LiveObservationSignalEvidence = {
  readonly detail: string;
  readonly id: string;
  readonly kind: LiveObservationEvidenceKind;
};

export type LiveObservationPossibleCause = {
  readonly evidenceIds: readonly string[];
  readonly kind: "inferred";
  readonly text: string;
};

export type LiveObservationUnknown = {
  readonly kind: "unknown";
  readonly text: string;
};

export type LiveObservationTimelineEvent = {
  readonly id: string;
  readonly label: string;
  readonly occurredAt: string;
};

export type LiveObservationSignalPoint = {
  readonly observedAt: string;
  readonly value: number;
};

export type LiveObservationSignal = {
  readonly currentValue?: string | undefined;
  readonly evidence: readonly LiveObservationSignalEvidence[];
  readonly firstObservedAt?: string | undefined;
  readonly history: readonly LiveObservationSignalPoint[];
  readonly id: string;
  readonly importance: string;
  readonly lastObservedAt?: string | undefined;
  readonly possibleCauses: readonly LiveObservationPossibleCause[];
  readonly status: Exclude<LiveObservationSignalStatus, "normal" | "checking" | "unknown">;
  readonly timeline: readonly LiveObservationTimelineEvent[];
  readonly title: string;
  readonly unknowns: readonly LiveObservationUnknown[];
  readonly userImpact: string;
};

export type LiveObservationDashboardStatus = {
  readonly dataNote?: string | undefined;
  readonly lastObservedAt?: string | undefined;
  readonly status: LiveObservationSignalStatus;
  readonly title: string;
  readonly unknowns: readonly LiveObservationUnknown[];
  readonly userImpact: string;
};

export type LiveObservationSignalDashboardModel = {
  readonly logGroups: readonly LiveObservationLogGroup[];
  readonly signals: readonly LiveObservationSignal[];
  readonly status: LiveObservationDashboardStatus;
};

export type LiveObservationSignalDashboardInput = {
  readonly deployment?: Deployment | null;
  readonly history?: readonly LiveObservationSessionHistorySample[];
  readonly snapshot: LiveObservationV2Snapshot | null;
};

type SignalCandidate = LiveObservationSignal & {
  readonly freshnessRank: number;
  readonly impactRank: number;
  readonly severityRank: number;
};

/** Converts one latest, provider-neutral snapshot into a small dashboard without creating new data or causes. */
export function createLiveObservationSignalDashboardModel(
  input: LiveObservationSignalDashboardInput
): LiveObservationSignalDashboardModel {
  const snapshot = input.snapshot;
  if (!snapshot) return { logGroups: [], signals: [], status: getWaitingStatus() };
  if (snapshot.status !== "active") {
    return { logGroups: [], signals: [], status: getEndedStatus(snapshot) };
  }

  const providerSnapshot = snapshot.latestObservation?.payload;
  if (!providerSnapshot) {
    return { logGroups: [], signals: [], status: getAwaitingProviderStatus() };
  }
  if (providerSnapshot.state === "unavailable") {
    return { logGroups: [], signals: [], status: getUnavailableStatus(providerSnapshot) };
  }
  if (providerSnapshot.state === "delayed") {
    return { logGroups: [], signals: [], status: getDelayedStatus(providerSnapshot) };
  }

  const logGroups = groupLiveObservationLogs(providerSnapshot.logs);
  const candidates = createSignalCandidates({
    deployment: input.deployment ?? null,
    history: input.history ?? [],
    logGroups,
    snapshot
  });
  const signals = orderSignalCandidates(candidates).slice(0, 3);

  return {
    logGroups,
    signals,
    status: getAvailableStatus({ providerSnapshot, signals, snapshot })
  };
}

/** Produces candidates only from a current provider snapshot, direct log groups, or the defined live-session calculation. */
function createSignalCandidates(input: {
  readonly deployment: Deployment | null;
  readonly history: readonly LiveObservationSessionHistorySample[];
  readonly logGroups: readonly LiveObservationLogGroup[];
  readonly snapshot: LiveObservationV2Snapshot;
}): readonly SignalCandidate[] {
  const providerSnapshot = input.snapshot.latestObservation?.payload;
  if (!providerSnapshot || providerSnapshot.state !== "available") return [];

  const candidates: SignalCandidate[] = [];
  const requestFailure = createRequestFailureSignal(input, providerSnapshot);
  if (requestFailure) candidates.push(requestFailure);

  const capacitySignals = createCapacitySignals(input, providerSnapshot);
  candidates.push(...capacitySignals);

  const logSignals = createLogSignals(input, providerSnapshot);
  candidates.push(...logSignals);

  return candidates;
}

/** Uses an observed non-zero failure ratio, or availability only when its matching ratio is missing. */
function createRequestFailureSignal(
  input: Parameters<typeof createSignalCandidates>[0],
  providerSnapshot: LiveObservationProviderSnapshot
): SignalCandidate | null {
  const errorRate = providerSnapshot.errorRate;
  const availability = providerSnapshot.availability;
  const requestCount = providerSnapshot.requests;
  if (requestCount !== null && requestCount > 0 && errorRate !== null && errorRate > 0) {
    const evidenceId = "request-failure-rate";
    return createCandidate({
      currentValue: formatPercent(errorRate),
      deployment: input.deployment,
      evidence: [
        {
          detail: `최근 확인한 요청 중 ${formatPercent(errorRate)}가 실패했어요.`,
          id: evidenceId,
          kind: "actual"
        }
      ],
      history: getSignalHistory(input.history, input.snapshot.observationId, "errorRate"),
      id: "request-failure",
      impactRank: 0,
      importance: "요청 실패는 사용자가 바로 겪을 수 있는 문제예요.",
      possibleCauses: [],
      severityRank: 0,
      status: "critical",
      title: "요청 실패가 확인됐어요",
      firstObservedAt: providerSnapshot.observedAt ?? undefined,
      lastObservedAt: providerSnapshot.observedAt ?? undefined,
      unknowns: getDeploymentUnknown(input.deployment),
      userImpact: "일부 사용자가 요청을 완료하지 못할 수 있어요."
    });
  }
  if (
    requestCount !== null &&
    requestCount > 0 &&
    errorRate === null &&
    availability !== null &&
    availability < 100
  ) {
    const evidenceId = "request-availability";
    return createCandidate({
      currentValue: formatPercent(availability),
      deployment: input.deployment,
      evidence: [
        {
          detail: `최근 확인한 요청의 응답 가능 비율은 ${formatPercent(availability)}예요.`,
          id: evidenceId,
          kind: "actual"
        }
      ],
      history: getSignalHistory(input.history, input.snapshot.observationId, "availability"),
      id: "request-failure",
      impactRank: 0,
      importance: "응답하지 못한 요청이 확인됐어요.",
      possibleCauses: [],
      severityRank: 0,
      status: "critical",
      title: "일부 요청이 정상 응답하지 않았어요",
      firstObservedAt: providerSnapshot.observedAt ?? undefined,
      lastObservedAt: providerSnapshot.observedAt ?? undefined,
      unknowns: getDeploymentUnknown(input.deployment),
      userImpact: "일부 사용자가 요청을 완료하지 못할 수 있어요."
    });
  }
  return null;
}

/** Detects only direct capacity count gaps, never a predicted scaling outcome or an individual failing task. */
function createCapacitySignals(
  input: Parameters<typeof createSignalCandidates>[0],
  providerSnapshot: LiveObservationProviderSnapshot
): readonly SignalCandidate[] {
  const { desired, healthy, running } = providerSnapshot.capacity;
  const signals: SignalCandidate[] = [];

  if (running !== null && healthy !== null && healthy < running) {
    const evidenceId = "capacity-health-gap";
    signals.push(
      createCandidate({
        currentValue: `${healthy} / ${running}`,
        deployment: input.deployment,
        evidence: [
          {
            detail: `실행 중인 서버 ${running}개 중 ${healthy}개가 정상 응답 중이에요.`,
            id: evidenceId,
            kind: "actual"
          }
        ],
        history: getSignalHistory(input.history, input.snapshot.observationId, "healthyCapacity"),
        id: "capacity-health-gap",
        impactRank: 1,
        importance: "정상 응답 서버 수가 실행 중인 서버 수보다 적어요.",
        possibleCauses: [],
        severityRank: 0,
        status: "critical",
        title: "정상 응답 서버가 부족해요",
        firstObservedAt: providerSnapshot.observedAt ?? undefined,
        lastObservedAt: providerSnapshot.observedAt ?? undefined,
        unknowns: getDeploymentUnknown(input.deployment),
        userImpact: "일부 요청이 처리되지 않을 수 있어요."
      })
    );
  }

  if (desired !== null && running !== null && running < desired) {
    const evidenceId = "capacity-running-gap";
    signals.push(
      createCandidate({
        currentValue: `${running} / ${desired}`,
        deployment: input.deployment,
        evidence: [
          {
            detail: `필요한 서버 수는 ${desired}개이고 현재 실행 중인 서버는 ${running}개예요.`,
            id: evidenceId,
            kind: "actual"
          }
        ],
        history: getSignalHistory(input.history, input.snapshot.observationId, "healthyCapacity"),
        id: "capacity-running-gap",
        impactRank: 2,
        importance: "필요한 수보다 적은 서버가 실행 중이에요.",
        possibleCauses: [],
        severityRank: 1,
        status: "warning",
        title: "실행 중인 서버 수가 예상보다 적어요",
        firstObservedAt: providerSnapshot.observedAt ?? undefined,
        lastObservedAt: providerSnapshot.observedAt ?? undefined,
        unknowns: getDeploymentUnknown(input.deployment),
        userImpact: "요청이 늘면 응답이 늦어질 수 있어요."
      })
    );
  }

  return signals;
}

/** Converts grouped, already-masked logs into cautious signals without treating message wording as a confirmed cause. */
function createLogSignals(
  input: Parameters<typeof createSignalCandidates>[0],
  providerSnapshot: LiveObservationProviderSnapshot
): readonly SignalCandidate[] {
  const groups = input.logGroups;
  const repeatedError = groups.find((group) => group.kind === "error" && group.count > 1);
  if (repeatedError) {
    const evidenceId = `log:${repeatedError.id}`;
    return [
      createCandidate({
        currentValue: `${repeatedError.count}회`,
        deployment: input.deployment,
        evidence: [
          {
            detail: `같은 오류 표현이 ${repeatedError.count}번 기록됐어요.`,
            id: evidenceId,
            kind: "actual"
          }
        ],
        firstObservedAt: repeatedError.firstObservedAt,
        history: [],
        id: "repeated-error-log",
        impactRank: 3,
        importance: "같은 오류가 계속 기록되고 있어요.",
        lastObservedAt: repeatedError.lastObservedAt,
        possibleCauses: getLogBasedPossibleCauses(repeatedError, evidenceId),
        severityRank: 1,
        status: "warning",
        timelineLogGroups: [repeatedError],
        title: "같은 오류가 반복되고 있어요",
        unknowns: getDeploymentUnknown(input.deployment),
        userImpact: "일부 기능이 불안정할 수 있어요."
      })
    ];
  }

  const singleError = groups.find((group) => group.kind === "error");
  if (singleError) {
    const evidenceId = `log:${singleError.id}`;
    const isNewWithinSession = isNewLogGroupWithinSession(
      input.history,
      input.snapshot.observationId,
      providerSnapshot.observedAt,
      singleError.id
    );
    return [
      createCandidate({
        currentValue: "1회",
        deployment: input.deployment,
        evidence: [
          {
            detail: "오류 표현이 기록됐어요.",
            id: evidenceId,
            kind: "actual"
          }
        ],
        firstObservedAt: singleError.firstObservedAt,
        freshnessRank: isNewWithinSession ? 0 : 1,
        history: [],
        id: isNewWithinSession ? "new-error-log" : "error-log",
        impactRank: 4,
        importance: isNewWithinSession
          ? "이전 관측에는 없던 오류 기록이에요."
          : "오류 기록을 확인할 필요가 있어요.",
        lastObservedAt: singleError.lastObservedAt,
        possibleCauses: [],
        severityRank: 1,
        status: "warning",
        timelineLogGroups: [singleError],
        title: isNewWithinSession ? "새 오류가 확인됐어요" : "오류 기록이 있어요",
        unknowns: getDeploymentUnknown(input.deployment),
        userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
      })
    ];
  }

  const warning = groups.find((group) => group.kind === "warning");
  if (!warning) return [];
  const evidenceId = `log:${warning.id}`;
  return [
    createCandidate({
      currentValue: `${warning.count}회`,
      deployment: input.deployment,
      evidence: [
        {
          detail: `확인이 필요한 경고 표현이 ${warning.count}번 기록됐어요.`,
          id: evidenceId,
          kind: "actual"
        }
      ],
      firstObservedAt: warning.firstObservedAt,
      history: [],
      id: "warning-log",
      impactRank: 5,
      importance: "경고가 반복되면 오류로 이어질 수 있어요.",
      lastObservedAt: warning.lastObservedAt,
      possibleCauses: [],
      severityRank: 2,
      status: "warning",
      timelineLogGroups: [warning],
      title: "확인이 필요한 경고가 있어요",
      unknowns: getDeploymentUnknown(input.deployment),
      userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
    })
  ];
}

/** Builds one consistent signal shape without claiming a resource relationship the aggregate snapshot cannot identify. */
function createCandidate(input: {
  readonly currentValue?: string;
  readonly deployment: Deployment | null;
  readonly evidence: readonly LiveObservationSignalEvidence[];
  readonly firstObservedAt?: string | undefined;
  readonly freshnessRank?: number | undefined;
  readonly history: readonly LiveObservationSignalPoint[];
  readonly id: string;
  readonly impactRank: number;
  readonly importance: string;
  readonly lastObservedAt?: string | undefined;
  readonly possibleCauses: readonly LiveObservationPossibleCause[];
  readonly severityRank: number;
  readonly status: LiveObservationSignal["status"];
  readonly timelineLogGroups?: readonly LiveObservationLogGroup[];
  readonly title: string;
  readonly unknowns: readonly LiveObservationUnknown[];
  readonly userImpact: string;
}): SignalCandidate {
  return {
    currentValue: input.currentValue,
    firstObservedAt: input.firstObservedAt,
    evidence: input.evidence,
    freshnessRank: input.freshnessRank ?? 1,
    history: input.history,
    id: input.id,
    impactRank: input.impactRank,
    importance: input.importance,
    lastObservedAt: input.lastObservedAt,
    possibleCauses: input.possibleCauses,
    severityRank: input.severityRank,
    status: input.status,
    timeline: createSignalTimeline({
      deployment: input.deployment,
      firstObservedAt: input.firstObservedAt,
      lastObservedAt: input.lastObservedAt,
      logGroups: input.timelineLogGroups ?? []
    }),
    title: input.title,
    unknowns: input.unknowns,
    userImpact: input.userImpact
  };
}

/** Orders user impact, severity, freshness, evidence quality, and a stable key for deterministic cards. */
function orderSignalCandidates(
  candidates: readonly SignalCandidate[]
): readonly LiveObservationSignal[] {
  return [...candidates]
    .sort((left, right) => {
      if (left.impactRank !== right.impactRank) return left.impactRank - right.impactRank;
      if (left.severityRank !== right.severityRank) return left.severityRank - right.severityRank;
      if (left.freshnessRank !== right.freshnessRank)
        return left.freshnessRank - right.freshnessRank;
      const evidenceQualityDifference = getEvidenceQuality(right) - getEvidenceQuality(left);
      if (evidenceQualityDifference !== 0) return evidenceQualityDifference;
      return left.id.localeCompare(right.id, "en");
    })
    .map(
      ({
        freshnessRank: _freshnessRank,
        impactRank: _impactRank,
        severityRank: _severityRank,
        ...signal
      }) => signal
    );
}

/** Prefers direct evidence over a derived session value when higher-priority signal dimensions are otherwise tied. */
function getEvidenceQuality(signal: SignalCandidate): number {
  return signal.evidence.reduce(
    (score, evidence) => score + (evidence.kind === "actual" ? 2 : 1),
    0
  );
}

/** Returns the latest current-session metric points only when at least two actual values exist for a meaningful SVG line. */
function getSignalHistory(
  history: readonly LiveObservationSessionHistorySample[],
  sessionId: string,
  metric: LiveObservationSignalHistoryMetric
): readonly LiveObservationSignalPoint[] {
  const points = history
    .filter((sample) => sample.sessionId === sessionId)
    .flatMap((sample) => {
      const value = sample.values[metric];
      return typeof value === "number" && Number.isFinite(value)
        ? [{ observedAt: sample.observedAt, value }]
        : [];
    });
  return points.length >= 2 ? points : [];
}

/** Calls a one-off error new only when an earlier actual session snapshot exists and lacks the same normalized fingerprint. */
function isNewLogGroupWithinSession(
  history: readonly LiveObservationSessionHistorySample[],
  sessionId: string,
  currentObservedAt: string | null,
  fingerprintId: string
): boolean {
  const currentTimestamp = currentObservedAt ? Date.parse(currentObservedAt) : Number.NaN;
  if (!Number.isFinite(currentTimestamp)) return false;

  const earlierSamples = history.filter((sample) => {
    if (sample.sessionId !== sessionId) return false;
    const sampleTimestamp = Date.parse(sample.observedAt);
    return Number.isFinite(sampleTimestamp) && sampleTimestamp < currentTimestamp;
  });
  return (
    earlierSamples.length > 0 &&
    !earlierSamples.some((sample) => sample.logFingerprintIds.includes(fingerprintId))
  );
}

/** Builds a closed timeline only from two or more actual event categories without declaring that adjacent events caused each other. */
function createSignalTimeline(input: {
  readonly deployment: Deployment | null;
  readonly firstObservedAt?: string | undefined;
  readonly lastObservedAt?: string | undefined;
  readonly logGroups: readonly LiveObservationLogGroup[];
}): readonly LiveObservationTimelineEvent[] {
  const eventKinds = new Set<string>();
  const events: (LiveObservationTimelineEvent & { readonly kind: string })[] = [];

  if (input.deployment?.completedAt) {
    eventKinds.add("deployment");
    events.push({
      id: `deployment:${input.deployment.completedAt}`,
      kind: "deployment",
      label: "배포 완료",
      occurredAt: input.deployment.completedAt
    });
  }

  if (input.logGroups.length > 0) {
    for (const group of input.logGroups) {
      eventKinds.add(`log:${group.kind}`);
      events.push({
        id: `log:${group.id}:first`,
        kind: `log:${group.kind}`,
        label: getTimelineLogLabel(group.kind),
        occurredAt: group.firstObservedAt
      });
      if (group.lastObservedAt !== group.firstObservedAt) {
        events.push({
          id: `log:${group.id}:last`,
          kind: `log:${group.kind}`,
          label: `${getTimelineLogLabel(group.kind)} 계속`,
          occurredAt: group.lastObservedAt
        });
      }
    }
  } else if (input.firstObservedAt) {
    eventKinds.add("signal");
    events.push({
      id: `signal:${input.firstObservedAt}`,
      kind: "signal",
      label: "문제 신호 확인",
      occurredAt: input.firstObservedAt
    });
    if (input.lastObservedAt && input.lastObservedAt !== input.firstObservedAt) {
      events.push({
        id: `signal:${input.lastObservedAt}`,
        kind: "signal",
        label: "문제 신호 계속",
        occurredAt: input.lastObservedAt
      });
    }
  }

  if (eventKinds.size < 2) return [];
  return events
    .sort((left, right) => {
      const timeDifference = left.occurredAt.localeCompare(right.occurredAt);
      return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id, "en");
    })
    .map(({ kind: _kind, ...event }) => event);
}

/** Converts a provider-neutral log group to a concise event label without exposing raw provider wording. */
function getTimelineLogLabel(kind: LiveObservationLogGroup["kind"]): string {
  if (kind === "error") return "오류 기록";
  if (kind === "warning") return "경고 기록";
  if (kind === "recovery") return "정상화 신호";
  return "확인할 로그";
}

/** Keeps connection wording as a possibility tied to the group evidence instead of turning log text into a confirmed root cause. */
function getLogBasedPossibleCauses(
  group: LiveObservationLogGroup,
  evidenceId: string
): readonly LiveObservationPossibleCause[] {
  if (!/\b(?:database|db|connection)\b|데이터베이스|연결/iu.test(group.normalizedMessage))
    return [];
  return [
    {
      evidenceIds: [evidenceId],
      kind: "inferred",
      text: "연결 오류가 반복돼 연결 경로를 확인할 필요가 있어요."
    }
  ];
}

/** Marks a deployment relationship unknown until there is a prior deployment and an actual before/after comparison. */
function getDeploymentUnknown(deployment: Deployment | null): readonly LiveObservationUnknown[] {
  return deployment ? [createUnknown("이번 배포와 관련 있는지는 아직 확인할 수 없어요.")] : [];
}

/** Creates the normal/checking summary from available evidence while keeping latency comparison explicitly unknown. */
function getAvailableStatus(input: {
  readonly providerSnapshot: LiveObservationProviderSnapshot;
  readonly signals: readonly LiveObservationSignal[];
  readonly snapshot: LiveObservationV2Snapshot;
}): LiveObservationDashboardStatus {
  const unknowns = getAvailableUnknowns(input.providerSnapshot);
  const lastObservedAt =
    input.providerSnapshot.observedAt ?? input.snapshot.latestObservation?.observedAt;
  const primarySignal = input.signals[0];
  if (primarySignal) {
    return {
      lastObservedAt,
      status: primarySignal.status,
      title: primarySignal.title,
      unknowns,
      userImpact: primarySignal.userImpact
    };
  }

  if (!hasCurrentHealthEvidence(input.providerSnapshot)) {
    return {
      dataNote: "지금 받은 값만으로는 상태를 확인할 수 없어요.",
      lastObservedAt,
      status: "checking",
      title: "서비스 상태를 확인하고 있어요",
      unknowns,
      userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
    };
  }

  return {
    lastObservedAt,
    status: "normal",
    title: "현재 큰 문제는 확인되지 않았어요",
    unknowns,
    userImpact: "현재 확인한 요청과 서버 상태에서 큰 문제는 보이지 않아요."
  };
}

/** Adds unknowns only where the current snapshot genuinely lacks a comparison or a value. */
function getAvailableUnknowns(
  providerSnapshot: LiveObservationProviderSnapshot
): readonly LiveObservationUnknown[] {
  const unknowns: LiveObservationUnknown[] = [];
  if (providerSnapshot.requests === null) {
    unknowns.push(createUnknown("확인된 요청 수가 없어 사용자 영향은 아직 알 수 없어요."));
  } else if (providerSnapshot.requests === 0) {
    unknowns.push(createUnknown("확인된 요청이 없어 사용자 영향은 아직 알 수 없어요."));
  }
  if (providerSnapshot.p95LatencyMs !== null) {
    unknowns.push(createUnknown("응답 시간이 느려졌는지는 비교 기준이 없어 알 수 없어요."));
  }
  if (providerSnapshot.errorRate === null && providerSnapshot.availability === null) {
    unknowns.push(createUnknown("요청 실패 여부를 확인할 값이 아직 없어요."));
  }
  if (
    providerSnapshot.capacity.desired === null ||
    providerSnapshot.capacity.running === null ||
    providerSnapshot.capacity.healthy === null
  ) {
    unknowns.push(createUnknown("서버 수를 모두 확인할 수 없어 용량 상태는 판단할 수 없어요."));
  }
  return unknowns;
}

/** Requires at least one directly observed health dimension before presenting the calm normal summary. */
function hasCurrentHealthEvidence(providerSnapshot: LiveObservationProviderSnapshot): boolean {
  return (
    providerSnapshot.requests !== null &&
    providerSnapshot.requests > 0 &&
    (providerSnapshot.errorRate !== null || providerSnapshot.availability !== null)
  );
}

/** Explains that the session has not produced a provider snapshot yet without turning absence into an incident. */
function getWaitingStatus(): LiveObservationDashboardStatus {
  return {
    dataNote: "관측 세션을 시작하면 최신 상태가 여기에 표시돼요.",
    status: "checking",
    title: "관측을 시작하면 상태를 확인할 수 있어요",
    unknowns: [createUnknown("관측 데이터가 아직 없어요.")],
    userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
  };
}

/** Distinguishes an active session waiting for AWS evidence from a healthy service. */
function getAwaitingProviderStatus(): LiveObservationDashboardStatus {
  return {
    dataNote: "AWS 관측값을 기다리고 있어요.",
    status: "checking",
    title: "서비스 상태를 확인하고 있어요",
    unknowns: [createUnknown("AWS 관측값이 아직 도착하지 않았어요.")],
    userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
  };
}

/** Keeps delayed data visibly stale instead of reusing it as a live normal or failure decision. */
function getDelayedStatus(
  providerSnapshot: LiveObservationProviderSnapshot
): LiveObservationDashboardStatus {
  return {
    dataNote: "마지막 관측값이 늦게 도착했어요. 최신 상태를 확인하고 있어요.",
    lastObservedAt: providerSnapshot.observedAt ?? undefined,
    status: "checking",
    title: "AWS 상태를 확인하고 있어요",
    unknowns: [createUnknown("현재 값이 늦게 도착해 서비스 상태를 확정할 수 없어요.")],
    userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
  };
}

/** Keeps provider failures separate from application incidents because the snapshot did not establish either condition. */
function getUnavailableStatus(
  providerSnapshot: LiveObservationProviderSnapshot
): LiveObservationDashboardStatus {
  return {
    dataNote: "AWS 관측값을 받지 못했어요.",
    lastObservedAt: providerSnapshot.observedAt ?? undefined,
    status: "unknown",
    title: "현재 데이터로는 서비스 상태를 확인할 수 없어요",
    unknowns: [createUnknown("관측값이 없어 사용자 영향과 원인을 확인할 수 없어요.")],
    userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
  };
}

/** Treats an ended observation as unavailable evidence rather than carrying the last screen state into a later session. */
function getEndedStatus(snapshot: LiveObservationV2Snapshot): LiveObservationDashboardStatus {
  return {
    dataNote: "새 관측 세션을 시작하면 최신 상태를 다시 확인할 수 있어요.",
    lastObservedAt: snapshot.terminalAt ?? undefined,
    status: "unknown",
    title: "관측이 끝났어요",
    unknowns: [createUnknown("현재 서비스 상태는 새 관측으로 확인해야 해요.")],
    userImpact: "현재 사용자 영향은 아직 확인할 수 없어요."
  };
}

/** Formats a factual percentage without implying that a separate normal range exists. */
function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}%`;
}

/** Marks a presentation statement as unknown so it cannot be styled or documented as observed evidence. */
function createUnknown(text: string): LiveObservationUnknown {
  return { kind: "unknown", text };
}
