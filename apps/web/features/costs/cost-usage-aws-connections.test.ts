import assert from "node:assert/strict";
import { test } from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  formatCostUsageAwsConnectionLabel,
  getVerifiedCostUsageAwsConnections,
  selectPreferredCostUsageAwsConnection
} from "./cost-usage-aws-connections";

test("getVerifiedCostUsageAwsConnections keeps only verified connections", () => {
  const connections = [
    createAwsConnection({ id: "pending-connection", status: "pending" }),
    createAwsConnection({ id: "verified-connection", status: "verified" }),
    createAwsConnection({ id: "failed-connection", status: "failed" })
  ];

  assert.deepEqual(
    getVerifiedCostUsageAwsConnections(connections).map((connection) => connection.id),
    ["verified-connection"]
  );
});

test("selectPreferredCostUsageAwsConnection preserves a selected verified connection", () => {
  const firstConnection = createAwsConnection({
    id: "first-connection",
    accountId: "111111111111"
  });
  const selectedConnection = createAwsConnection({
    id: "selected-connection",
    accountId: "222222222222"
  });

  assert.equal(
    selectPreferredCostUsageAwsConnection(
      [firstConnection, selectedConnection],
      selectedConnection.id
    )?.id,
    selectedConnection.id
  );
});

test("selectPreferredCostUsageAwsConnection falls back to the first verified connection", () => {
  const pendingConnection = createAwsConnection({
    id: "pending-connection",
    status: "pending"
  });
  const verifiedConnection = createAwsConnection({
    id: "verified-connection",
    status: "verified"
  });

  assert.equal(
    selectPreferredCostUsageAwsConnection(
      [pendingConnection, verifiedConnection],
      pendingConnection.id
    )?.id,
    verifiedConnection.id
  );
});

test("formatCostUsageAwsConnectionLabel shows account and region", () => {
  const connection = createAwsConnection({
    accountId: "123456789012",
    region: "ap-northeast-2"
  });

  assert.equal(formatCostUsageAwsConnectionLabel(connection), "123456789012 · ap-northeast-2");
});

function createAwsConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    accountId: "123456789012",
    createdAt: "2026-07-07T00:00:00.000Z",
    externalId: "sc_conn_test",
    id: "33333333-3333-4333-8333-333333333333",
    lastVerifiedAt: "2026-07-07T00:00:00.000Z",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    status: "verified",
    updatedAt: "2026-07-07T00:00:00.000Z",
    userId: "22222222-2222-4222-8222-222222222222",
    ...overrides
  };
}
