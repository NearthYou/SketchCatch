import assert from "node:assert/strict";
import test from "node:test";
import type { ChatSyncCommand } from "@aws-sdk/client-qbusiness";
import { createAmazonQArchitectureDraftProvider } from "./aiArchitectureQBusiness.js";

test("requirement conflict requests ask Amazon Q Business instead of returning another canonical plan", async () => {
  const userMessages: string[] = [];
  const amazonQAnswer = JSON.stringify({
    status: "needs_clarification",
    question: "고가용성과 최소 비용을 동시에 유지하기 어렵습니다. 어떤 조건을 우선할까요?",
    suggestions: ["고가용성을 유지하고 비용 조건을 완화", "최소 비용을 유지하고 가용성 조건을 완화"]
  });
  const provider = createAmazonQArchitectureDraftProvider({
    region: "ap-northeast-2",
    retrievalApplicationId: "amazon-q-app",
    retryDelay: async () => undefined,
    retrievalClient: {
      send: async (command: ChatSyncCommand) => {
        userMessages.push(command.input.userMessage ?? "");
        if (userMessages.length === 1) {
          return {
            systemMessage: "verified",
            sourceAttributions: [
              { documentId: "sketchcatch-pattern-serverless-api-v1" },
              { documentId: "sketchcatch-pattern-multi-az-rds-v1" }
            ]
          };
        }
        return { systemMessage: amazonQAnswer, sourceAttributions: [] };
      }
    }
  });

  const response = await provider.generate({
    target: "architecture_draft",
    instructions: "diagnose conflicts",
    prompt: "return a clarification",
    payload: {
      task: "requirement_conflict_clarification",
      prompt: "최소 비용으로 99.99% 가용성을 보장해줘",
      normalizedRequirement: {
        intent: "api",
        patternIds: ["serverless-api"],
        requiredResources: ["LAMBDA"]
      },
      validationIssues: ["99.99% availability requires redundancy that violates the minimum-cost constraint"]
    }
  });

  assert.equal(userMessages.length, 2);
  assert.match(userMessages[1] ?? "", /99\.99% availability/u);
  assert.match(userMessages[1] ?? "", /최소 비용으로 99\.99% 가용성/u);
  assert.equal(response.text, amazonQAnswer);
});