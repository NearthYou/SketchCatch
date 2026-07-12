import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";

test("resolveArchitectureRequirement maps the Korean SPA questionnaire answers", () => {
  const resolution = resolveArchitectureRequirement({
    prompt: [
      "어떤 종류의 웹사이트인가요?",
      "SPA (Single Page Application) (React/Vue 등)",
      "예상 트래픽 규모는?",
      "중간 규모 (일 1,000명, 동시 50명)",
      "데이터베이스가 필요한가요?",
      "중간 규모 데이터 (10GB ~ 100GB)",
      "백엔드가 필요한가요?",
      "간단한 API (Node.js, Python Flask 등)",
      "파일 업로드 기능이 있나요? (이미지, 문서 등)",
      "이미지만 (프로필, 게시글 이미지)",
      "실시간 기능이 필요한가요? (채팅, 알림 등)",
      "실시간 알림",
      "트래픽 패턴은?",
      "이벤트성 급증 (특정 시기에만)"
    ].join("\n")
  });

  assert.equal(resolution.selectedDraftPattern, "backend_with_db");
  assert.equal(resolution.servicePurpose, "file_upload_service");
  assert.ok(resolution.requirementFacts.includes("database"));
  assert.ok(resolution.requirementFacts.includes("file_upload"));
  assert.ok(resolution.requirementFacts.includes("object_storage"));
  assert.ok(resolution.capabilities.includes("relational_data"));
  assert.ok(resolution.capabilities.includes("media_storage"));
  assert.equal(resolution.operatingProfile.trafficLevel, "normal");
  assert.equal(resolution.operatingProfile.securityPriority, "high");
  assert.equal(resolution.intent.constraints.traffic, "growth");
  assert.equal(resolution.intent.constraints.security, "sensitive");
});
