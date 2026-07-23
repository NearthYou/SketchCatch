import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ReverseEngineeringStartCard,
  type ReverseEngineeringStartCardProps
} from "./ReverseEngineeringStartCard";
import type { ReverseEngineeringAwsConnectionRecovery } from "./reverse-engineering-aws-connection-readiness";

const readyRecovery: ReverseEngineeringAwsConnectionRecovery = {
  readiness: "ready",
  canStartScan: true,
  title: "AWS Role이 아직 준비되지 않았습니다.",
  description: "",
  actionLabel: "",
  settingsHref: "/dashboard/settings?tab=aws&next=reverse",
  selectedConnectionId: "connection-1"
};

function renderCard(overrides: Partial<ReverseEngineeringStartCardProps> = {}): string {
  return renderToStaticMarkup(
    createElement(ReverseEngineeringStartCard, {
      awsConnectionRecovery: readyRecovery,
      canStartScan: true,
      failure: null,
      isLoadingOptions: false,
      isScanning: false,
      onScanStart() {},
      ...overrides
    })
  );
}

test("시작 카드는 중앙에서 AWS 구조 가져오기 행동을 보여준다", () => {
  const html = renderCard();

  assert.match(html, /Reverse Engineering/);
  assert.match(html, /기존 AWS 가져오기/);
  assert.doesNotMatch(html, /<strong>/);
  assert.doesNotMatch(html, /연결된 AWS 계정의 리소스를 읽어/);
  assert.doesNotMatch(html, /ARN|Resource ID|Provider 오류 코드|Terraform/);
});

test("AWS 연결 문제는 환경 설정 이동과 다시 시도를 함께 보여준다", () => {
  const html = renderCard({
    failure: {
      action: "open_settings",
      description: "AWS 연결을 확인한 뒤 다시 가져와 주세요.",
      title: "AWS 연결을 확인해 주세요."
    }
  });

  assert.match(html, /AWS 연결을 확인해 주세요\./);
  assert.match(html, /환경 설정으로 이동/);
  assert.match(html, /다시 시도/);
  assert.match(html, /\/dashboard\/settings\?tab=aws&amp;next=reverse/);
});

test("일시적인 가져오기 실패는 환경 설정으로 보내지 않고 다시 시도만 보여준다", () => {
  const html = renderCard({
    failure: {
      action: "retry",
      description: "잠시 후 다시 시도해 주세요.",
      title: "AWS 구조를 가져오지 못했습니다."
    }
  });

  assert.match(html, /AWS 구조를 가져오지 못했습니다\./);
  assert.match(html, /다시 시도/);
  assert.doesNotMatch(html, /환경 설정으로 이동/);
});

test("가져오는 동안 시작 카드는 중복 클릭을 막고 진행 상태를 말한다", () => {
  const html = renderCard({ isScanning: true });

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /AWS 구조를 읽는 중…/);
  assert.match(html, /disabled=""/);
});
