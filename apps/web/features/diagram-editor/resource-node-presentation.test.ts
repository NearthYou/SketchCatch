import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramNode } from "../../../../packages/types/src";

import { getResourceNodePresentation } from "./resource-node-presentation";

test("presents only the uppercase label and icon data used by the node view", () => {
  const presentation = getResourceNodePresentation(
    makeNode({ label: "Assets", resourceType: "aws_s3_bucket" })
  );

  assert.deepEqual(presentation, {
    icon: { family: "service" },
    label: "ASSETS"
  });
});

test("classifies each AWS icon family without imposing a fixed optical size", () => {
  assert.deepEqual(
    getResourceNodePresentation(
      makeNode({
        iconUrl: "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_AWS-Lambda_64.svg"
      })
    ).icon,
    { family: "service" }
  );
  assert.deepEqual(
    getResourceNodePresentation(
      makeNode({ iconUrl: "/Resource-Icons_07312025/Res_Storage/Res_Amazon-S3_Bucket_48.svg" })
    ).icon,
    { family: "resource" }
  );
  assert.deepEqual(
    getResourceNodePresentation(
      makeNode({ iconUrl: "/Architecture-Group-Icons_07312025/Region_32.svg" })
    ).icon,
    { family: "group" }
  );
  assert.deepEqual(getResourceNodePresentation(makeNode({ iconUrl: undefined })).icon, {
    family: "fallback"
  });
});

function makeNode(options: {
  iconUrl?: string | undefined;
  label?: string | undefined;
  resourceType?: string | undefined;
} = {}): Pick<DiagramNode, "iconUrl" | "label" | "parameters" | "type"> {
  const iconUrl = Object.hasOwn(options, "iconUrl")
    ? options.iconUrl
    : "/Architecture-Service-Icons_07312025/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg";
  const label = options.label ?? "S3 Bucket";
  const resourceType = options.resourceType ?? "aws_s3_bucket";

  return {
    iconUrl,
    label,
    parameters: {
      fileName: "main",
      resourceName: "example",
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    type: resourceType
  };
}
