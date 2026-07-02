import assert from "node:assert/strict";
import { test } from "node:test";
import type { LlmExplanation } from "@sketchcatch/types";
import { parseLlmExplanationText } from "./aiLlmExplanationValidation.js";

const fallback: LlmExplanation = {
  target: "architecture_draft",
  summary: "fallback summary",
  highlights: ["fallback highlight"],
  nextActions: ["fallback action"],
  fallbackUsed: true,
  fallbackReason: "invalid_response"
};

test("parseLlmExplanationText accepts Bedrock text model JSON variants", () => {
  const text = [
    "Here is the JSON:",
    "```json",
    "{",
    '  "target": "architecture_draft",',
    '  "summary": "Draft explains the deterministic architecture choices.",',
    '  "highlights": "The static site uses S3 and CloudFront.",',
    '  "next_actions": "Review the generated board before applying changes."',
    "}",
    "```"
  ].join("\n");

  const result = parseLlmExplanationText(text, fallback);

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.target, "architecture_draft");
  assert.equal(result.summary, "Draft explains the deterministic architecture choices.");
  assert.deepEqual(result.highlights, ["The static site uses S3 and CloudFront."]);
  assert.deepEqual(result.nextActions, ["Review the generated board before applying changes."]);
});

test("parseLlmExplanationText trims safe fields without showing fallback badge", () => {
  const text = JSON.stringify({
    target: "architecture_draft",
    summary: "  Draft explanation is valid after whitespace cleanup.  ",
    highlights: ["  deterministic planner keeps the resource set stable.  "],
    nextActions: ["  Review the preview before applying it.  "],
    fallbackUsed: false
  });

  const result = parseLlmExplanationText(text, fallback);

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.summary, "Draft explanation is valid after whitespace cleanup.");
  assert.deepEqual(result.highlights, ["deterministic planner keeps the resource set stable."]);
  assert.deepEqual(result.nextActions, ["Review the preview before applying it."]);
});
