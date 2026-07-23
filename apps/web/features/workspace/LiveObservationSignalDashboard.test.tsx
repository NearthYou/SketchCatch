import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Deployment, LiveObservationV2Snapshot } from "@sketchcatch/types";

import { LiveObservationSignalDashboard } from "./LiveObservationSignalDashboard";

test("실시간 수집 지표를 먼저 보여주고 중요 신호는 세 개 이하로 렌더링한다", () => {
  const html = renderDashboard(
    snapshot({
      capacity: { desired: 3, healthy: 1, max: 4, running: 3 },
      errorRate: 2.5,
      logs: [
        {
          message: "database connection failed requestId=one",
          timestamp: "2026-07-21T01:00:00.000Z"
        },
        {
          message: "database connection failed requestId=two",
          timestamp: "2026-07-21T01:01:00.000Z"
        }
      ]
    })
  );

  const signalHeadingIndex = html.indexOf('id="live-observation-signals-heading"');
  assert.ok(html.indexOf("실시간 수집 지표") < signalHeadingIndex);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 3);
  const text = renderedText(html);
  assertAppearsInOrder(text, ["실시간 수집 지표", "중요한 문제", "문제 상세"]);
  assert.doesNotMatch(text, /현재 상태|지금 확인할 내용|선택한 신호|다음 확인/);
  assert.doesNotMatch(text, /관련 로그를 확인해 보세요/);
  assert.match(html, /확인된 사실/);
  assert.match(html, /확인한 내용/);
  assert.match(html, /가능성이 높은 원인/);
  assert.match(html, /원인은 아직 확인하지 못했어요/);
  assert.doesNotMatch(html, /추가로 확인할 수 없는 내용은 없어요/);
  assert.doesNotMatch(html, /요청 실패는 사용자가 바로 겪을 수 있는 문제예요/);
});

test("대표 로그는 닫힌 disclosure 뒤에서만 열 수 있고 가짜 대응 버튼을 만들지 않는다", () => {
  const html = renderDashboard(
    snapshot({
      logs: [
        {
          message: "database connection failed requestId=one",
          timestamp: "2026-07-21T01:00:00.000Z"
        },
        {
          message: "database connection failed requestId=two",
          timestamp: "2026-07-21T01:01:00.000Z"
        }
      ]
    })
  );

  assert.match(html, /<details/);
  assert.match(html, /로그 보기/);
  assert.match(html, /requestid=\[id\]/);
  assert.doesNotMatch(html, /requestId=(?:one|two)/);
  assert.doesNotMatch(html, /CloudWatch 상세 열기|자동 적용|Terraform 변경|배포하기/);
});

test("오류·경고·복구·확인 로그를 한 화면에서 묶고 근거 없는 리소스 chip은 만들지 않는다", () => {
  const html = renderDashboard(
    snapshot({
      logs: [
        { message: "request failed", timestamp: "2026-07-21T01:00:00.000Z" },
        { message: "warning retrying request", timestamp: "2026-07-21T01:01:00.000Z" },
        { message: "service recovered", timestamp: "2026-07-21T01:02:00.000Z" },
        { message: "worker started", timestamp: "2026-07-21T01:03:00.000Z" }
      ]
    })
  );

  assert.match(html, /오류가 기록됐어요/);
  assert.match(html, /확인이 필요한 경고가 기록됐어요/);
  assert.match(html, /정상화 신호가 기록됐어요/);
  assert.match(html, /확인이 필요한 로그가 기록됐어요/);
  assert.doesNotMatch(html, /관련 리소스/);
});

test("두 종류의 실제 시각이 있을 때만 접힌 사고 흐름을 보여준다", () => {
  const html = renderDashboard(snapshot({ errorRate: 2.5 }), {
    completedAt: "2026-07-21T00:55:00.000Z"
  } as Deployment);

  assert.match(html, /시간순 기록 보기/);
  assert.match(html, /시간이 가깝다고 원인인 것은 아니에요/);
  assert.match(html, /아직 확인할 수 없는 부분/);
});

test("관측 전에는 수집 지표의 대기 상태만 보여주고 문제를 만들어내지 않는다", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationSignalDashboard, {
      deployment: null,
      snapshot: null
    })
  );
  const text = renderedText(html);

  assert.match(text, /실시간 수집 지표/);
  assert.match(text, /AWS 관측 시작 대기/);
  assert.match(text, /수집 요청 0건/);
  assert.doesNotMatch(text, /현재 상태|상태를 확인하고 있어요/);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 0);
});

test("참여 요청이 도착하면 현재 상태 카드 없이 수집 건수를 갱신한다", () => {
  const observedAt = "2026-07-21T01:02:00.000Z";
  const value = snapshot({});
  value.latestObservation = null;
  value.live = {
    ...value.live,
    acceptedEventCount: 2,
    observedAt
  };

  const text = renderedText(renderDashboard(value));

  assert.match(text, /실시간 수집 지표/);
  assert.match(text, /수집 요청 2건/);
  assert.match(text, /AWS 관측 시작 대기/);
  assert.doesNotMatch(text, /현재 상태|상태를 확인하고 있어요/);
});

test("실행 가능한 용량 수정안은 신호가 없어도 쉬운 사용자 행동으로 보여준다", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationSignalDashboard, {
      deployment: null,
      recommendedAction: {
        actionLabel: "Project Draft 수정",
        boundary: "수정안을 저장해도 실제 AWS에는 바로 반영되지 않아요.",
        description: "최대 실행 수를 2개에서 3개로 늘리는 수정안을 검토할 수 있어요.",
        isApplying: false,
        isLoading: false,
        onAction: () => undefined,
        title: "용량 설정을 확인해 보세요"
      },
      snapshot: null
    })
  );

  assert.match(html, /다음 행동/);
  assert.match(html, /수정안 저장/);
  assert.match(html, /실제 AWS에는 바로 반영되지 않아요/);
  assert.doesNotMatch(html, /Project Draft|자동 배포|AWS에 적용/);
});

test("수정안 진행 상태는 AI나 원본 오류를 사용자에게 노출하지 않는다", () => {
  const html = renderToStaticMarkup(
    createElement(LiveObservationSignalDashboard, {
      deployment: null,
      recommendedAction: {
        actionLabel: "Project Draft 수정",
        boundary: "수정안을 저장해도 실제 AWS에는 바로 반영되지 않아요.",
        description: "최대 실행 수를 늘리는 수정안을 검토할 수 있어요.",
        errorMessage: "Provider snapshot unavailable: max_capacity is missing",
        explanation: "42개 Resource로 Design Simulation을 만들었습니다.",
        isApplying: true,
        isLoading: true,
        onAction: () => undefined,
        title: "용량 설정을 확인해 보세요"
      },
      snapshot: null
    })
  );
  const text = renderedText(html);

  assert.match(text, /수정안을 준비하고 있어요/);
  assert.match(text, /수정안을 저장하고 있어요/);
  assert.match(text, /수정안을 준비하지 못했어요/);
  assert.match(text, /AI 분석: 42개 Resource로 Design Simulation을 만들었습니다\./);
  assert.doesNotMatch(text, /Provider|snapshot|max_capacity|Project Draft/);
});

function renderDashboard(
  value: LiveObservationV2Snapshot,
  deployment: Deployment | null = null
): string {
  return renderToStaticMarkup(
    createElement(LiveObservationSignalDashboard, {
      deployment,
      snapshot: value
    })
  );
}

function renderedText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function assertAppearsInOrder(text: string, values: readonly string[]): void {
  let previousIndex = -1;
  for (const value of values) {
    const index = text.indexOf(value);
    assert.ok(index > previousIndex, `Expected ${value} after the previous section`);
    previousIndex = index;
  }
}

function snapshot(overrides: {
  readonly availability?: number | null;
  readonly capacity?: {
    readonly desired: number | null;
    readonly healthy: number | null;
    readonly max: number | null;
    readonly running: number | null;
  };
  readonly errorRate?: number | null;
  readonly logs?: readonly { readonly message: string; readonly timestamp: string }[];
}): LiveObservationV2Snapshot {
  const observedAt = "2026-07-21T01:00:00.000Z";
  return {
    latestObservation: {
      observedAt,
      payload: {
        availability: overrides.availability ?? 100,
        capacity: overrides.capacity ?? { desired: 1, healthy: 1, max: 2, running: 1 },
        errorRate: overrides.errorRate ?? 0,
        logs: [...(overrides.logs ?? [])],
        observedAt,
        p95LatencyMs: 120,
        requests: 12,
        state: "available"
      }
    },
    live: {
      acceptedEventCount: 2,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 12,
      rollingRequestsPerSecond: 0.2
    },
    observationId: "observation-1",
    status: "active",
    terminalAt: null
  };
}
