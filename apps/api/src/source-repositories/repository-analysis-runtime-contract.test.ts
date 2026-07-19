import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRepositoryEvidence } from "./repository-analysis.js";

test("repository analysis detects stateless check-in scale and runtime secret contracts", () => {
  const result = analyzeRepositoryEvidence({
    revision: "a".repeat(40),
    treePaths: ["Dockerfile", "README.md", "package.json"],
    files: [
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { express: "5.1.0" } })
      },
      {
        path: "Dockerfile",
        content: "FROM node:22-alpine\nENV NODE_ENV=production\nEXPOSE 8080\n"
      },
      {
        path: "README.md",
        content: [
          "The API runs on ECS Fargate behind an ALB.",
          "Stateless signed session이라 ECS/Fargate가 1개에서 최대 3개로 확장되더라도 sticky session이나 Redis가 필요하지 않습니다.",
          "All tasks receive the same CHECK_IN_SIGNING_SECRET from AWS Secrets Manager."
        ].join("\n")
      }
    ]
  });

  assert.ok(result.architectureFacts?.some(
    (fact) => fact.kind === "runtime_scale" && fact.value === "autoscaling_1_3"
  ));
  assert.equal(result.architectureFacts?.some(
    (fact) => fact.kind === "runtime_scale" && fact.value === "single_task"
  ), false);
  assert.ok(result.architectureFacts?.some(
    (fact) => fact.kind === "runtime_secret" && fact.value === "CHECK_IN_SIGNING_SECRET"
  ));
});
