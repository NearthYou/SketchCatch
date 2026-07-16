import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramNode } from "@sketchcatch/types";
import { terraformParameterCatalog } from "../parameter-input/catalog";
import { buildResourceListItems } from "./resource-list-summary";

test("IAM Policy data source summary uses the data schema instead of the resource schema", () => {
  const node: DiagramNode = {
    id: "policy-data",
    kind: "resource",
    label: "Change password policy",
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: "change_password",
      resourceType: "aws_iam_policy",
      terraformBlockType: "data",
      values: {
        arn: "arn:aws:iam::aws:policy/IAMUserChangePassword"
      }
    },
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    type: "aws_iam_policy",
    zIndex: 0
  };

  const [summary] = buildResourceListItems([node], terraformParameterCatalog);

  assert.ok(summary);
  assert.equal(summary.status, "ready");
  assert.equal(summary.terraformAddress, "data.aws_iam_policy.change_password");
  assert.deepEqual(summary.rows, [
    {
      key: "arn",
      kind: "optional",
      label: "Policy ARN",
      value: "arn:aws:iam::aws:policy/IAMUserChangePassword"
    }
  ]);
});
