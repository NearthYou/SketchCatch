import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitecturePatchPreview } from "@sketchcatch/types";
import { createArchitecturePatchPreview } from "./aiArchitecturePatchPreview.js";

test("CloudFront OAC signing behavior를 never로 바꾸는 미리보기를 만든다", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      edges: [],
      nodes: [
        {
          config: {
            name: "static-site-oac",
            signingBehavior: "always",
            signingProtocol: "sigv4",
            terraformResourceType: "aws_cloudfront_origin_access_control"
          },
          id: "oac",
          label: "CloudFront Origin Access Control",
          positionX: 0,
          positionY: 0,
          type: "CLOUDFRONT"
        }
      ]
    },
    instruction: "cloudfront에서 signing behavior 값 안하도록 바꿔줘",
    selectedTargetResourceId: "oac"
  });

  assert.equal(response.status, "preview");
  const preview = response as ArchitecturePatchPreview;
  assert.equal(preview.proposedArchitectureJson.nodes[0]?.config.signingBehavior, "never");
  assert.deepEqual(preview.patchPlan?.operations, [
    {
      op: "set_value",
      path: "config.signingBehavior",
      value: "never"
    }
  ]);
});
