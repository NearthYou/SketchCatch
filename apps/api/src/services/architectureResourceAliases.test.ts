import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_TYPES } from "@sketchcatch/types";
import { createArchitecturePatchPreview } from "./aiArchitecturePatchPreview.js";
import {
  getNaturalLanguageResourceAliases,
  RESOURCE_TYPE_KOREAN_NAMES
} from "./architectureResourceAliases.js";

test("모든 지원 리소스에 자연어 별칭을 제공하고 대표 한국어 이름을 파싱한다", () => {
  const supportedResourceTypes = RESOURCE_TYPES.filter(
    (resourceType) => resourceType !== "UNKNOWN"
  );

  assert.deepEqual(
    Object.keys(RESOURCE_TYPE_KOREAN_NAMES).sort(),
    [...supportedResourceTypes].sort()
  );

  for (const resourceType of supportedResourceTypes) {
    const aliases = getNaturalLanguageResourceAliases(resourceType);
    assert.ok(aliases.length >= 3, `${resourceType} 별칭이 충분하지 않습니다.`);

    const response = createArchitecturePatchPreview({
      architectureJson: { edges: [], nodes: [] },
      instruction: `${RESOURCE_TYPE_KOREAN_NAMES[resourceType]} 추가해줘`
    });

    assert.equal(
      response.intent.resourceType,
      resourceType,
      `${RESOURCE_TYPE_KOREAN_NAMES[resourceType]} 파싱 결과가 잘못되었습니다.`
    );
  }
});

test("서비스별 통칭과 약어도 리소스 타입으로 파싱한다", () => {
  const scenarios = [
    ["메시지 큐 넣어줘", "SQS_QUEUE"],
    ["SSL 인증서 추가해줘", "ACM_CERTIFICATE"],
    ["쿠버네티스 클러스터 만들어줘", "EKS_CLUSTER"],
    ["가드듀티 탐지기 넣어줘", "GUARDDUTY_DETECTOR"],
    ["파라미터 스토어 추가해줘", "SSM_PARAMETER"]
  ] as const;

  for (const [instruction, resourceType] of scenarios) {
    const response = createArchitecturePatchPreview({
      architectureJson: { edges: [], nodes: [] },
      instruction
    });

    assert.equal(response.intent.resourceType, resourceType, instruction);
  }
});
