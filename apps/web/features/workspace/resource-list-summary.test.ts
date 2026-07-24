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

test("Template Resource 목록은 Terraform local name보다 사용자 표시 이름을 우선한다", () => {
  const node: DiagramNode = {
    id: "eks-cluster-role",
    kind: "resource",
    label: "EKS Cluster IAM Role",
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: "iam-cluster",
      resourceType: "aws_iam_role",
      terraformBlockType: "resource",
      values: {}
    },
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    type: "aws_iam_role",
    zIndex: 0
  };

  const [summary] = buildResourceListItems([node], terraformParameterCatalog);

  assert.ok(summary);
  assert.equal(summary.displayName, "EKS Cluster IAM Role");
  assert.equal(summary.terraformAddress, "aws_iam_role.iam-cluster");
});

test("Reverse Engineering Resource 목록은 보존한 AWS 원본 식별자를 화면에 노출하지 않는다", () => {
  const node: DiagramNode = {
    id: "imported-lambda",
    kind: "resource",
    label: "orders-handler",
    locked: false,
    metadata: {
      reverseEngineering: {
        source: "aws_scan",
        protectedValueKeys: ["providerResourceId", "providerResourceType", "accountId"],
        editableValueKeys: ["displayName", "description"]
      }
    },
    parameters: {
      fileName: "main",
      resourceName: "orders_handler",
      resourceType: "aws_lambda_function",
      values: {
        accountId: "123456789012",
        description: "주문 처리",
        providerResourceId:
          "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        providerResourceType: "AWS::Lambda::Function"
      }
    },
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    type: "aws_lambda_function",
    zIndex: 0
  };

  const [summary] = buildResourceListItems([node], terraformParameterCatalog);

  assert.ok(summary);
  assert.deepEqual(
    summary.rows.map(({ key, value }) => ({ key, value })),
    [{ key: "description", value: "주문 처리" }]
  );
});
