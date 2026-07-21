import type { LiveObservationProviderSnapshot } from "@sketchcatch/types";

export type LiveObservationLogGroupKind = "error" | "warning" | "recovery" | "check";

export type LiveObservationLogGroup = {
  readonly count: number;
  readonly firstObservedAt: string;
  readonly id: string;
  readonly kind: LiveObservationLogGroupKind;
  readonly lastObservedAt: string;
  readonly normalizedMessage: string;
  readonly representative: LiveObservationProviderSnapshot["logs"][number];
  readonly summary: string;
};

const GROUP_ORDER: Readonly<Record<LiveObservationLogGroupKind, number>> = {
  error: 0,
  warning: 1,
  recovery: 2,
  check: 3
};

/** Groups already-masked runtime logs so the dashboard starts with repeat patterns, not a raw chronology. */
export function groupLiveObservationLogs(
  logs: readonly LiveObservationProviderSnapshot["logs"][number][]
): readonly LiveObservationLogGroup[] {
  const groups = new Map<string, LiveObservationLogGroup>();

  for (const entry of logs) {
    const kind = getLiveObservationLogKind(entry.message);
    const normalizedMessage = normalizeLiveObservationLogMessage(entry.message);
    const id = `${kind}:${createLiveObservationLogFingerprint(normalizedMessage)}`;
    const current = groups.get(id);

    if (!current) {
      groups.set(id, {
        count: 1,
        firstObservedAt: entry.timestamp,
        id,
        kind,
        lastObservedAt: entry.timestamp,
        normalizedMessage,
        representative: entry,
        summary: getLiveObservationLogSummary(kind, 1)
      });
      continue;
    }

    const isNewest = entry.timestamp >= current.lastObservedAt;
    const nextCount = current.count + 1;
    groups.set(id, {
      ...current,
      count: nextCount,
      firstObservedAt:
        entry.timestamp < current.firstObservedAt ? entry.timestamp : current.firstObservedAt,
      lastObservedAt: isNewest ? entry.timestamp : current.lastObservedAt,
      representative: isNewest ? entry : current.representative,
      summary: getLiveObservationLogSummary(kind, nextCount)
    });
  }

  return [...groups.values()].sort((left, right) => {
    const kindDifference = GROUP_ORDER[left.kind] - GROUP_ORDER[right.kind];
    if (kindDifference !== 0) return kindDifference;
    if (left.count !== right.count) return right.count - left.count;
    if (left.lastObservedAt !== right.lastObservedAt) {
      return left.lastObservedAt < right.lastObservedAt ? 1 : -1;
    }
    return left.id.localeCompare(right.id, "en");
  });
}

/** Produces an opaque stable fingerprint so bounded client history never retains a normalized message or user identifier. */
function createLiveObservationLogFingerprint(normalizedMessage: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalizedMessage.length; index += 1) {
    hash ^= normalizedMessage.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Replaces volatile request identifiers before fingerprinting so one repeating error stays one evidence group. */
export function normalizeLiveObservationLogMessage(message: string): string {
  return message
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      "[id]"
    )
    .replace(/\b(?:request|trace|correlation)[-_ ]?id\s*[=:]\s*[^\s,;]+/giu, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      const label = match.slice(0, match.indexOf(separator)).trim();
      return `${label}${separator}[id]`;
    })
    .replace(/\b\d{6,}\b/gu, "[id]")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

/** Uses conservative words in a masked message only to choose a display bucket; it never declares a root cause. */
export function getLiveObservationLogKind(message: string): LiveObservationLogGroupKind {
  if (/\b(?:recovered|recovery|healthy)\b|정상화|복구/iu.test(message)) return "recovery";
  if (
    /\b(?:error|exception|failed|failure|timeout|timed out|denied|unavailable)\b|오류|실패|시간 초과/iu.test(
      message
    )
  ) {
    return "error";
  }
  if (/\b(?:warn|warning|retry|retrying)\b|경고|재시도/iu.test(message)) return "warning";
  return "check";
}

/** Keeps the first dashboard sentence short while retaining the raw, already-masked line behind a disclosure. */
function getLiveObservationLogSummary(kind: LiveObservationLogGroupKind, count: number): string {
  if (kind === "error") {
    return count > 1 ? "같은 오류 표현이 반복되고 있어요." : "오류 표현이 기록됐어요.";
  }
  if (kind === "warning") return "확인이 필요한 경고가 기록됐어요.";
  if (kind === "recovery") return "정상화 신호가 기록됐어요.";
  return "확인이 필요한 로그가 기록됐어요.";
}
