import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { getWorkspaceAiPatchParameterChanges } from "./workspace-ai-patch-preview";

const baseArchitectureJson: ArchitectureJson = {
  edges: [],
  nodes: [
    {
      config: {
        name: "web-oac",
        signing_behavior: "always",
        terraformResourceType: "aws_cloudfront_origin_access_control"
      },
      id: "cloudfront-oac",
      label: "CloudFront Origin Access Control",
      positionX: 0,
      positionY: 0,
      type: "CLOUDFRONT"
    }
  ]
};

test("파라미터 수정 미리보기는 리소스와 변경 전후 값을 명확히 추출한다", () => {
  const baseNode = baseArchitectureJson.nodes[0]!;
  const proposedArchitectureJson: ArchitectureJson = {
    ...baseArchitectureJson,
    nodes: [
      {
        ...baseNode,
        config: {
          ...baseNode.config,
          signing_behavior: "never"
        }
      }
    ]
  };

  assert.deepEqual(getWorkspaceAiPatchParameterChanges(baseArchitectureJson, proposedArchitectureJson), [
    {
      after: "never",
      before: "always",
      parameter: "signing_behavior",
      resourceId: "cloudfront-oac",
      resourceLabel: "CloudFront Origin Access Control",
      resourceType: "aws_cloudfront_origin_access_control"
    }
  ]);
});

test("parameter change extraction tolerates missing architecture nodes", () => {
  const missingNodes = {
    ...baseArchitectureJson,
    nodes: undefined
  } as unknown as ArchitectureJson;

  assert.deepEqual(
    getWorkspaceAiPatchParameterChanges(undefined as unknown as ArchitectureJson, baseArchitectureJson),
    []
  );
  assert.deepEqual(getWorkspaceAiPatchParameterChanges(baseArchitectureJson, missingNodes), []);
});
