import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiArchitectureDraftResult, CreateArchitectureDraftRequest } from "@sketchcatch/types";
import {
  planArchitectureDraftPreview,
  resolveArchitectureDraftFollowUpAnswer
} from "./workspace-ai-draft-follow-up";

const baseRequest: CreateArchitectureDraftRequest = {
  budgetLevel: "low",
  prompt: "웹사이트 하나 배포하고 싶어",
  scenarioHint: "backend_with_db",
  securityPriority: "basic",
  trafficLevel: "small"
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
  assert.match(decision.session.question, /DB/);
  assert.deepEqual(decision.session.suggestions, ["DB 없이 다시 만들기", "DB 포함해서 진행"]);
});

test("database removal answers regenerate with a non-database draft request", () => {
  const decision = planArchitectureDraftPreview(baseRequest, backendDraft);

  assert.equal(decision.action, "ask_follow_up");

  if (decision.action !== "ask_follow_up") {
    return;
  }

  const resolution = resolveArchitectureDraftFollowUpAnswer(
    decision.session,
    "DB 없이 다시 만들기"
  );

  assert.equal(resolution.action, "regenerate");

  if (resolution.action !== "regenerate") {
    return;
  }

  assert.equal(resolution.request.budgetLevel, "low");
  assert.equal(resolution.request.scenarioHint, "api_server");
  assert.doesNotMatch(resolution.request.prompt, /\bdb\b|database/i);
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
