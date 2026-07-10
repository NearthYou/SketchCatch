import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiArchitectureDraftResult, CreateArchitectureDraftRequest } from "@sketchcatch/types";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer
} from "./workspace-ai-draft-follow-up";

const baseRequest: CreateArchitectureDraftRequest = {
  prompt: "로그인 있는 웹사이트를 처음엔 저렴하게 배포하고 싶어"
};

const backendDraft: AiArchitectureDraftResult = {
  architectureJson: {
    edges: [],
    nodes: [
      {
        config: {},
        id: "api-server",
        label: "API Server",
        positionX: 0,
        positionY: 0,
        type: "EC2"
      },
      {
        config: {},
        id: "database",
        label: "Database",
        positionX: 300,
        positionY: 0,
        type: "RDS"
      }
    ]
  },
  metadata: {
    assumptions: [],
    confidence: "medium",
    explanations: [],
    guardrailWarnings: [
      {
        code: "low_budget_rds_cost",
        message: "낮은 예산 조건에서 DB 비용이 커질 수 있습니다."
      }
    ],
    source: "template_fallback"
  },
  title: "Backend With DB"
};

test("draft guardrail warnings hold the preview until the user answers", () => {
  const decision = planArchitectureDraftPreview(baseRequest, backendDraft);

  assert.equal(decision.action, "ask_follow_up");

  if (decision.action !== "ask_follow_up") {
    return;
  }

  assert.equal(decision.session.kind, "low_budget_rds_cost");
  assert.equal(decision.session.pendingDraft, backendDraft);
  assert.equal(
    decision.session.question,
    "질문: DB가 포함되면 비용이 늘 수 있습니다. 낮은 예산을 우선해서 DB 없는 구조로 만들까요?"
  );
  assert.deepEqual(decision.session.suggestions, ["DB 없이 만들기", "DB 포함해서 진행"]);
});

test("database removal answers regenerate with a non-database draft request", () => {
  const decision = planArchitectureDraftPreview(baseRequest, backendDraft);

  assert.equal(decision.action, "ask_follow_up");

  if (decision.action !== "ask_follow_up") {
    return;
  }

  const resolution = resolveArchitectureDraftFollowUpAnswer(
    decision.session,
    "DB 없이 만들기"
  );

  assert.equal(resolution.action, "regenerate");

  if (resolution.action !== "regenerate") {
    return;
  }

  assert.deepEqual(Object.keys(resolution.request), ["prompt"]);
  assert.match(resolution.request.prompt, /DB 없이/);
  assert.match(resolution.request.prompt, /API 서버/);
  assert.doesNotMatch(resolution.request.prompt, /database/i);
});

test("accepting the pending draft does not regenerate or repeat the question", () => {
  const decision = planArchitectureDraftPreview(baseRequest, backendDraft);

  assert.equal(decision.action, "ask_follow_up");

  if (decision.action !== "ask_follow_up") {
    return;
  }

  const resolution = resolveArchitectureDraftFollowUpAnswer(
    decision.session,
    "DB 포함해서 진행"
  );

  assert.equal(resolution.action, "show_pending_draft");
});
